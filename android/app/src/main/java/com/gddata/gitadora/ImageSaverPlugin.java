package com.gddata.gitadora;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

@CapacitorPlugin(name = "ImageSaver")
public class ImageSaverPlugin extends Plugin {

    private static final String ALBUM_NAME = "GDData";

    @PluginMethod
    public void saveImage(PluginCall call) {
        String dataBase64 = trimToNull(call.getString("dataBase64"));
        String filename = sanitizeFilename(trimToNull(call.getString("filename")));
        String mimeType = normalizeMimeType(call.getString("mimeType"));

        if (dataBase64 == null) {
            call.reject("Image data is empty.");
            return;
        }

        byte[] imageBytes;

        try {
            imageBytes = Base64.decode(stripDataUrlPrefix(dataBase64), Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("Image data is not valid base64.", error);
            return;
        }

        if (imageBytes.length == 0) {
            call.reject("Image data is empty.");
            return;
        }

        String finalFilename = ensureFilenameExtension(filename, mimeType);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveImageWithMediaStore(call, imageBytes, finalFilename, mimeType);
            return;
        }

        saveLegacyImage(call, imageBytes, finalFilename, mimeType);
    }

    private void saveImageWithMediaStore(
        PluginCall call,
        byte[] imageBytes,
        String filename,
        String mimeType
    ) {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
        values.put(MediaStore.Images.Media.MIME_TYPE, mimeType);
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + ALBUM_NAME);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri uri = null;

        try {
            uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);

            if (uri == null) {
                call.reject("Unable to create image in MediaStore.");
                return;
            }

            try (OutputStream outputStream = resolver.openOutputStream(uri)) {
                if (outputStream == null) {
                    throw new IllegalStateException("Unable to open MediaStore output stream.");
                }

                outputStream.write(imageBytes);
                outputStream.flush();
            }

            ContentValues publishedValues = new ContentValues();
            publishedValues.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(uri, publishedValues, null, null);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception error) {
            if (uri != null) {
                resolver.delete(uri, null, null);
            }

            call.reject("Failed to save image to gallery.", error);
        }
    }

    private void saveLegacyImage(
        PluginCall call,
        byte[] imageBytes,
        String filename,
        String mimeType
    ) {
        try {
            File picturesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES);
            File albumDir = new File(picturesDir, ALBUM_NAME);

            if (!albumDir.exists() && !albumDir.mkdirs()) {
                call.reject("Unable to create gallery album.");
                return;
            }

            File imageFile = buildUniqueFile(albumDir, filename);

            try (FileOutputStream outputStream = new FileOutputStream(imageFile)) {
                outputStream.write(imageBytes);
                outputStream.flush();
            }

            MediaScannerConnection.scanFile(
                getContext(),
                new String[] { imageFile.getAbsolutePath() },
                new String[] { mimeType },
                null
            );

            JSObject result = new JSObject();
            result.put("uri", Uri.fromFile(imageFile).toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Failed to save image to gallery.", error);
        }
    }

    private static File buildUniqueFile(File directory, String filename) {
        File candidate = new File(directory, filename);

        if (!candidate.exists()) {
            return candidate;
        }

        String name = filename;
        String extension = "";
        int extensionIndex = filename.lastIndexOf('.');

        if (extensionIndex > 0) {
            name = filename.substring(0, extensionIndex);
            extension = filename.substring(extensionIndex);
        }

        int index = 1;

        do {
            candidate = new File(directory, name + "-" + index + extension);
            index += 1;
        } while (candidate.exists());

        return candidate;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String stripDataUrlPrefix(String dataBase64) {
        int commaIndex = dataBase64.indexOf(',');

        if (dataBase64.startsWith("data:") && commaIndex >= 0) {
            return dataBase64.substring(commaIndex + 1);
        }

        return dataBase64;
    }

    private static String sanitizeFilename(String filename) {
        String baseName = filename == null ? "cover" : filename;
        String sanitized = baseName
            .replaceAll("[\\\\/:*?\"<>|]+", "_")
            .replaceAll("\\s+", " ")
            .trim();

        if (sanitized.isEmpty()) {
            return "cover";
        }

        return sanitized.length() > 96 ? sanitized.substring(0, 96) : sanitized;
    }

    private static String normalizeMimeType(String mimeType) {
        if (mimeType == null) {
            return "image/png";
        }

        String normalized = mimeType.trim().toLowerCase(Locale.ROOT);

        if ("image/jpeg".equals(normalized) || "image/jpg".equals(normalized)) {
            return "image/jpeg";
        }

        if ("image/webp".equals(normalized)) {
            return "image/webp";
        }

        return "image/png";
    }

    private static String ensureFilenameExtension(String filename, String mimeType) {
        if (filename.matches(".*\\.[A-Za-z0-9]+$")) {
            return filename;
        }

        if ("image/jpeg".equals(mimeType)) {
            return filename + ".jpg";
        }

        if ("image/webp".equals(mimeType)) {
            return filename + ".webp";
        }

        return filename + ".png";
    }
}
