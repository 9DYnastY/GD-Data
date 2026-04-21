package com.gddata.gitadora;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private static final String TAG = "GDDataAppUpdate";
    private static final String PREFS_NAME = "gddata_app_update";
    private static final String KEY_VERSION_NAME = "versionName";
    private static final String KEY_VERSION_CODE = "versionCode";
    private static final String KEY_FILE_PATH = "filePath";
    private static final String KEY_APK_SIZE = "apkSize";
    private static final String KEY_APK_SHA256 = "apkSha256";
    private static final String KEY_PENDING_INSTALL = "pendingInstall";
    private static final String KEY_INSTALLING = "installing";
    private static final String KEY_ERROR_MESSAGE = "errorMessage";
    private static final String RESOLVED_UPDATE_DIR_NAME = "app-update-installer";
    private static final String APK_MIME_TYPE = "application/vnd.android.package-archive";
    private static final String ERROR_MISSING_APK = "\u66f4\u65b0\u5305\u4e0d\u5b58\u5728\u6216\u5df2\u635f\u574f\uff0c\u8bf7\u91cd\u65b0\u4e0b\u8f7d\u3002";
    private static final String ERROR_OPEN_PERMISSION_SETTINGS = "\u65e0\u6cd5\u6253\u5f00\u5b89\u88c5\u6743\u9650\u8bbe\u7f6e\uff0c\u8bf7\u624b\u52a8\u5141\u8bb8\u5b89\u88c5\u672a\u77e5\u5e94\u7528\u3002";
    private static final String ERROR_OPEN_INSTALLER = "\u65e0\u6cd5\u6253\u5f00\u7cfb\u7edf\u5b89\u88c5\u754c\u9762\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002";
    private static final String ERROR_INVALID_FILE_PATH = "\u66f4\u65b0\u5305\u8def\u5f84\u65e0\u6548\uff0c\u8bf7\u91cd\u65b0\u4e0b\u8f7d\u3002";

    private SharedPreferences preferences;

    @Override
    public void load() {
        super.load();
        preferences = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        synchronizeOnResume();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(buildCurrentState().toJSObject());
    }

    @PluginMethod
    public void startUpdate(PluginCall call) {
        String fileUriInput = trimToNull(call.getString("fileUri"));
        String filePathInput = fileUriInput != null ? fileUriInput : trimToNull(call.getString("filePath"));
        String versionName = trimToNull(call.getString("versionName"));
        Integer versionCodeValue = call.getInt("versionCode");
        Long apkSizeValue = call.getLong("apkSize");
        String apkSha256 = trimToNull(call.getString("apkSha256"));

        if (filePathInput == null || versionName == null || versionCodeValue == null) {
            call.reject("AppUpdate.startUpdate requires fileUri, versionName and versionCode.");
            return;
        }

        Log.d(
            TAG,
            "startUpdate requested for versionCode="
                + versionCodeValue
                + ", versionName="
                + versionName
                + ", source="
                + describeFileInput(filePathInput)
        );

        try {
            long versionCode = versionCodeValue.longValue();
            String resolvedFilePath = resolveLocalFilePath(filePathInput, versionName, versionCode);
            long apkSize = apkSizeValue == null ? 0L : Math.max(0L, apkSizeValue.longValue());
            String normalizedSha256 = apkSha256 == null ? "" : apkSha256.toLowerCase(Locale.ROOT);

            UpdateRecord record = readRecord();
            if (record != null && isCurrentVersionInstalled(record.versionCode)) {
                clearState(record, true);
                record = null;
            }

            if (
                record != null &&
                (record.versionCode != versionCode || !resolvedFilePath.equals(record.filePath))
            ) {
                clearState(record, true);
                record = null;
            }

            if (record == null) {
                record = new UpdateRecord();
            }

            record.versionName = versionName;
            record.versionCode = versionCode;
            record.filePath = resolvedFilePath;
            record.apkSize = apkSize;
            record.apkSha256 = normalizedSha256;
            record.pendingInstall = true;
            record.installing = false;
            record.errorMessage = "";
            saveRecord(record);

            Log.d(
                TAG,
                "Prepared update record with filePath="
                    + resolvedFilePath
                    + ", apkSize="
                    + apkSize
                    + ", hasSha256="
                    + !normalizedSha256.isEmpty()
            );

            if (isCurrentVersionInstalled(record.versionCode)) {
                clearState(record, true);
                call.resolve(AppUpdateState.idle().toJSObject());
                return;
            }

            call.resolve(maybeContinueInstallFlow(record).toJSObject());
        } catch (IllegalArgumentException exception) {
            Log.e(TAG, "Invalid update file input.", exception);
            call.resolve(
                AppUpdateState.failed(
                    versionName == null ? "" : versionName,
                    versionCodeValue == null ? 0L : versionCodeValue.longValue(),
                    ERROR_INVALID_FILE_PATH
                ).toJSObject()
            );
        } catch (Exception exception) {
            Log.e(TAG, "Failed to prepare app update installer.", exception);
            call.reject("Failed to prepare app update installer: " + exception.getMessage(), exception);
        }
    }

    private void synchronizeOnResume() {
        UpdateRecord record = readRecord();
        if (record == null) {
            return;
        }

        Log.d(
            TAG,
            "Synchronizing update state on resume for versionCode="
                + record.versionCode
                + ", pendingInstall="
                + record.pendingInstall
                + ", installing="
                + record.installing
        );

        if (isCurrentVersionInstalled(record.versionCode)) {
            clearState(record, true);
            return;
        }

        if (record.installing) {
            record.installing = false;
            saveRecord(record);
        }

        if (record.pendingInstall && isDownloadedApkUsable(record) && canRequestPackageInstallsCompat()) {
            maybeContinueInstallFlow(record);
        }
    }

    @NonNull
    private AppUpdateState buildCurrentState() {
        return buildCurrentState(readRecord());
    }

    @NonNull
    private AppUpdateState buildCurrentState(@Nullable UpdateRecord record) {
        if (record == null) {
            return AppUpdateState.idle();
        }

        if (isCurrentVersionInstalled(record.versionCode)) {
            clearState(record, true);
            return AppUpdateState.idle();
        }

        if (record.installing) {
            return AppUpdateState.installing(record);
        }

        if (isDownloadedApkUsable(record)) {
            long fileSize = getDownloadedFileSize(record);
            if (record.pendingInstall && !canRequestPackageInstallsCompat()) {
                return AppUpdateState.permissionRequired(record, fileSize);
            }

            return AppUpdateState.downloaded(record, fileSize);
        }

        if (record.errorMessage != null && !record.errorMessage.isEmpty()) {
            return AppUpdateState.failed(record, record.errorMessage);
        }

        return AppUpdateState.idle();
    }

    @NonNull
    private AppUpdateState maybeContinueInstallFlow(@NonNull UpdateRecord record) {
        if (!isDownloadedApkUsable(record)) {
            Log.e(TAG, "Update package is not usable, aborting installer launch for " + record.filePath);
            return markFailed(record, ERROR_MISSING_APK, false);
        }

        if (!canRequestPackageInstallsCompat()) {
            try {
                Log.d(TAG, "Unknown sources permission missing, opening settings.");
                openUnknownSourcesSettings();
                record.pendingInstall = true;
                record.installing = false;
                record.errorMessage = "";
                saveRecord(record);
                return AppUpdateState.permissionRequired(record, getDownloadedFileSize(record));
            } catch (Exception exception) {
                Log.e(TAG, "Failed to open unknown sources settings.", exception);
                return markFailed(record, ERROR_OPEN_PERMISSION_SETTINGS, false);
            }
        }

        try {
            launchInstaller(record);
            return AppUpdateState.installing(record);
        } catch (Exception exception) {
            Log.e(TAG, "Failed to launch installer.", exception);
            return markFailed(record, ERROR_OPEN_INSTALLER, false);
        }
    }

    private void launchInstaller(@NonNull UpdateRecord record) {
        File apkFile = new File(record.filePath);
        Uri contentUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apkFile
        );

        Log.d(TAG, "Launching installer for " + apkFile.getAbsolutePath() + " via " + contentUri);

        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
        intent.setDataAndType(contentUri, APK_MIME_TYPE);
        intent.setClipData(ClipData.newRawUri("", contentUri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra(Intent.EXTRA_RETURN_RESULT, true);
        intent.putExtra(Intent.EXTRA_INSTALLER_PACKAGE_NAME, getContext().getPackageName());

        record.pendingInstall = false;
        record.installing = true;
        record.errorMessage = "";
        saveRecord(record);

        if (getActivity() != null) {
            getActivity().startActivity(intent);
        } else {
            getContext().startActivity(intent);
        }
    }

    private void openUnknownSourcesSettings() {
        Intent intent = new Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getContext().getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (getActivity() != null) {
            getActivity().startActivity(intent);
        } else {
            getContext().startActivity(intent);
        }
    }

    private boolean canRequestPackageInstallsCompat() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return true;
        }

        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private boolean isDownloadedApkUsable(@NonNull UpdateRecord record) {
        File apkFile = new File(record.filePath);
        if (!apkFile.isFile() || apkFile.length() <= 0) {
            Log.d(TAG, "APK file is missing or empty: " + record.filePath);
            return false;
        }

        if (record.apkSize > 0L && apkFile.length() != record.apkSize) {
            Log.d(
                TAG,
                "APK size mismatch for "
                    + record.filePath
                    + ": expected="
                    + record.apkSize
                    + ", actual="
                    + apkFile.length()
            );
            return false;
        }

        if (!record.apkSha256.isEmpty()) {
            try {
                String computedSha256 = computeSha256(apkFile);
                if (!record.apkSha256.equalsIgnoreCase(computedSha256)) {
                    Log.d(TAG, "APK SHA-256 mismatch for " + record.filePath + ": " + computedSha256);
                    return false;
                }
            } catch (IOException | NoSuchAlgorithmException exception) {
                Log.e(TAG, "Failed to hash update package.", exception);
                return false;
            }
        }

        PackageInfo archiveInfo = getArchivePackageInfo(apkFile.getAbsolutePath());
        if (archiveInfo == null) {
            Log.d(TAG, "PackageManager could not parse update archive " + apkFile.getAbsolutePath());
            return false;
        }

        long archiveVersionCode = PackageInfoCompat.getLongVersionCode(archiveInfo);
        boolean packageMatches = getContext().getPackageName().equals(archiveInfo.packageName);
        boolean versionMatches = archiveVersionCode == record.versionCode;

        if (!packageMatches || !versionMatches) {
            Log.d(
                TAG,
                "Archive metadata mismatch. package="
                    + archiveInfo.packageName
                    + ", versionCode="
                    + archiveVersionCode
                    + ", expectedPackage="
                    + getContext().getPackageName()
                    + ", expectedVersionCode="
                    + record.versionCode
            );
            return false;
        }

        return true;
    }

    private long getDownloadedFileSize(@NonNull UpdateRecord record) {
        File apkFile = new File(record.filePath);
        return apkFile.isFile() ? apkFile.length() : 0L;
    }

    @Nullable
    private PackageInfo getArchivePackageInfo(@NonNull String archivePath) {
        PackageManager packageManager = getContext().getPackageManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return packageManager.getPackageArchiveInfo(
                archivePath,
                PackageManager.PackageInfoFlags.of(0)
            );
        }

        return packageManager.getPackageArchiveInfo(archivePath, 0);
    }

    private boolean isCurrentVersionInstalled(long versionCode) {
        try {
            PackageInfo packageInfo;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageInfo =
                    getContext()
                        .getPackageManager()
                        .getPackageInfo(
                            getContext().getPackageName(),
                            PackageManager.PackageInfoFlags.of(0)
                        );
            } else {
                packageInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            }

            return PackageInfoCompat.getLongVersionCode(packageInfo) >= versionCode;
        } catch (PackageManager.NameNotFoundException exception) {
            return false;
        }
    }

    private void clearState(@NonNull UpdateRecord record, boolean deleteFile) {
        if (deleteFile) {
            deleteFileIfExists(new File(record.filePath));
        }

        preferences.edit().clear().apply();
    }

    private void deleteFileIfExists(@Nullable File file) {
        if (file != null && file.exists()) {
            if (!file.delete()) {
                Log.w(TAG, "Failed to delete file: " + file.getAbsolutePath());
            }
        }
    }

    @NonNull
    private AppUpdateState markFailed(
        @NonNull UpdateRecord record,
        @NonNull String errorMessage,
        boolean deleteFile
    ) {
        if (deleteFile) {
            deleteFileIfExists(new File(record.filePath));
        }

        Log.e(
            TAG,
            "Marking update flow as failed for versionCode="
                + record.versionCode
                + ", filePath="
                + record.filePath
                + ", error="
                + errorMessage
        );

        record.pendingInstall = false;
        record.installing = false;
        record.errorMessage = errorMessage;
        saveRecord(record);
        return AppUpdateState.failed(record, errorMessage);
    }

    @NonNull
    private String resolveLocalFilePath(
        @NonNull String filePathInput,
        @NonNull String versionName,
        long versionCode
    ) throws IOException {
        String normalized = filePathInput.trim();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("Empty file path.");
        }

        Uri uri = Uri.parse(normalized);
        String scheme = uri.getScheme();
        Log.d(TAG, "Resolving update file path with scheme=" + (scheme == null ? "<none>" : scheme));

        if (scheme == null || scheme.isEmpty()) {
            return new File(normalized).getAbsolutePath();
        }

        if ("file".equalsIgnoreCase(scheme)) {
            String path = uri.getPath();
            if (path == null || path.trim().isEmpty()) {
                throw new IllegalArgumentException("Invalid file URI.");
            }
            return new File(path).getAbsolutePath();
        }

        if ("content".equalsIgnoreCase(scheme)) {
            return copyContentUriToLocalFile(uri, versionName, versionCode).getAbsolutePath();
        }

        throw new IllegalArgumentException("Unsupported file path scheme.");
    }

    @NonNull
    private File copyContentUriToLocalFile(
        @NonNull Uri sourceUri,
        @NonNull String versionName,
        long versionCode
    ) throws IOException {
        File targetDirectory = getResolvedUpdateDirectory();
        String filename = buildResolvedApkFilename(versionName, versionCode);
        File tempFile = new File(targetDirectory, filename + ".tmp");
        File targetFile = new File(targetDirectory, filename);
        long copiedBytes = 0L;

        deleteFileIfExists(tempFile);

        try (InputStream input = getContext().getContentResolver().openInputStream(sourceUri)) {
            if (input == null) {
                throw new IOException("Content resolver returned null input stream.");
            }

            try (FileOutputStream output = new FileOutputStream(tempFile, false)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    copiedBytes += read;
                }
                output.getFD().sync();
            }
        } catch (IOException exception) {
            deleteFileIfExists(tempFile);
            throw exception;
        }

        if (copiedBytes <= 0L || !tempFile.isFile()) {
            deleteFileIfExists(tempFile);
            throw new IOException("Resolved update file is empty.");
        }

        deleteFileIfExists(targetFile);
        if (!tempFile.renameTo(targetFile)) {
            deleteFileIfExists(tempFile);
            throw new IOException("Unable to finalize resolved update file.");
        }

        Log.d(
            TAG,
            "Copied content URI update package to "
                + targetFile.getAbsolutePath()
                + " ("
                + copiedBytes
                + " bytes)"
        );
        return targetFile;
    }

    @NonNull
    private File getResolvedUpdateDirectory() throws IOException {
        File externalFilesDir = getContext().getExternalFilesDir(null);
        File targetDirectory = externalFilesDir != null
            ? new File(externalFilesDir, RESOLVED_UPDATE_DIR_NAME)
            : new File(getContext().getCacheDir(), RESOLVED_UPDATE_DIR_NAME);

        if (targetDirectory.isDirectory()) {
            return targetDirectory;
        }

        if (targetDirectory.exists() && !targetDirectory.isDirectory()) {
            throw new IOException("Resolved update path is not a directory.");
        }

        if (!targetDirectory.mkdirs() && !targetDirectory.isDirectory()) {
            throw new IOException("Unable to create resolved update directory.");
        }

        return targetDirectory;
    }

    @NonNull
    private String buildResolvedApkFilename(@NonNull String versionName, long versionCode) {
        String safeVersion = versionName.replaceAll("[^0-9A-Za-z._-]+", "_");
        if (safeVersion.isEmpty()) {
            safeVersion = String.valueOf(versionCode);
        }
        return "gddata-update-v" + safeVersion + "-" + versionCode + ".apk";
    }

    @NonNull
    private String describeFileInput(@NonNull String rawInput) {
        Uri uri = Uri.parse(rawInput);
        String scheme = uri.getScheme();
        if (scheme == null || scheme.isEmpty()) {
            return "path:" + rawInput;
        }

        return scheme + ":" + uri;
    }

    @Nullable
    private UpdateRecord readRecord() {
        long versionCode = preferences.getLong(KEY_VERSION_CODE, Long.MIN_VALUE);
        String filePath = trimToNull(preferences.getString(KEY_FILE_PATH, null));
        if (versionCode == Long.MIN_VALUE || filePath == null) {
            return null;
        }

        UpdateRecord record = new UpdateRecord();
        record.versionName = preferences.getString(KEY_VERSION_NAME, "");
        record.versionCode = versionCode;
        record.filePath = filePath;
        record.apkSize = Math.max(0L, preferences.getLong(KEY_APK_SIZE, 0L));
        record.apkSha256 = preferences.getString(KEY_APK_SHA256, "");
        record.pendingInstall = preferences.getBoolean(KEY_PENDING_INSTALL, false);
        record.installing = preferences.getBoolean(KEY_INSTALLING, false);
        record.errorMessage = preferences.getString(KEY_ERROR_MESSAGE, "");
        return record;
    }

    private void saveRecord(@NonNull UpdateRecord record) {
        preferences
            .edit()
            .putString(KEY_VERSION_NAME, record.versionName)
            .putLong(KEY_VERSION_CODE, record.versionCode)
            .putString(KEY_FILE_PATH, record.filePath)
            .putLong(KEY_APK_SIZE, record.apkSize)
            .putString(KEY_APK_SHA256, record.apkSha256)
            .putBoolean(KEY_PENDING_INSTALL, record.pendingInstall)
            .putBoolean(KEY_INSTALLING, record.installing)
            .putString(KEY_ERROR_MESSAGE, record.errorMessage == null ? "" : record.errorMessage)
            .apply();
    }

    @Nullable
    private String trimToNull(@Nullable String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    @NonNull
    private String computeSha256(@NonNull File file) throws IOException, NoSuchAlgorithmException {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[8192];

        try (FileInputStream input = new FileInputStream(file)) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }

        byte[] hash = digest.digest();
        StringBuilder builder = new StringBuilder(hash.length * 2);
        for (byte value : hash) {
            builder.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        }
        return builder.toString();
    }

    private static final class UpdateRecord {
        String versionName = "";
        long versionCode = 0L;
        String filePath = "";
        long apkSize = 0L;
        String apkSha256 = "";
        boolean pendingInstall = false;
        boolean installing = false;
        String errorMessage = "";
    }

    private static final class AppUpdateState {
        final String status;
        final String versionName;
        final long versionCode;
        final long bytesDownloaded;
        final long totalBytes;
        final String errorMessage;

        AppUpdateState(
            @NonNull String status,
            @NonNull String versionName,
            long versionCode,
            long bytesDownloaded,
            long totalBytes,
            @NonNull String errorMessage
        ) {
            this.status = status;
            this.versionName = versionName;
            this.versionCode = versionCode;
            this.bytesDownloaded = bytesDownloaded;
            this.totalBytes = totalBytes;
            this.errorMessage = errorMessage;
        }

        static AppUpdateState idle() {
            return new AppUpdateState("idle", "", 0L, 0L, 0L, "");
        }

        static AppUpdateState downloaded(@NonNull UpdateRecord record, long totalBytes) {
            return new AppUpdateState(
                "downloaded",
                record.versionName,
                record.versionCode,
                Math.max(0L, totalBytes),
                Math.max(0L, totalBytes),
                ""
            );
        }

        static AppUpdateState permissionRequired(@NonNull UpdateRecord record, long totalBytes) {
            return new AppUpdateState(
                "permission_required",
                record.versionName,
                record.versionCode,
                Math.max(0L, totalBytes),
                Math.max(0L, totalBytes),
                ""
            );
        }

        static AppUpdateState installing(@NonNull UpdateRecord record) {
            return new AppUpdateState("installing", record.versionName, record.versionCode, 0L, 0L, "");
        }

        static AppUpdateState failed(@NonNull UpdateRecord record, @NonNull String errorMessage) {
            return failed(record.versionName, record.versionCode, errorMessage);
        }

        static AppUpdateState failed(
            @NonNull String versionName,
            long versionCode,
            @NonNull String errorMessage
        ) {
            return new AppUpdateState("failed", versionName, versionCode, 0L, 0L, errorMessage);
        }

        JSObject toJSObject() {
            JSObject result = new JSObject();
            result.put("status", status);
            result.put("versionName", versionName);
            result.put("versionCode", versionCode);
            result.put("bytesDownloaded", bytesDownloaded);
            result.put("totalBytes", totalBytes);
            result.put("errorMessage", errorMessage);
            return result;
        }
    }
}
