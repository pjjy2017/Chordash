package com.chordash.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app updates (1.5): downloads a new APK from GitHub Releases into the app's cache and opens
 * Android's installer for it. Android always asks the user to confirm; the first time it also
 * asks to allow Chordash to install apps.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("bad url");
            return;
        }
        // Not allowed to install yet: open the setting, and let the user try again.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            call.reject("permission", "permission");
            return;
        }
        new Thread(() -> {
            try {
                File apk = download(url);
                Uri uri = FileProvider.getUriForFile(getContext(),
                        getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "download failed" : e.getMessage());
            }
        }).start();
    }

    /** Follows GitHub's redirects to the file and saves it, telling the page how far it got. */
    private File download(String address) throws Exception {
        HttpURLConnection connection = null;
        URL url = new URL(address);
        for (int hops = 0; hops < 5; hops++) {
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                url = new URL(url, connection.getHeaderField("Location"));
                connection.disconnect();
                continue;
            }
            if (status != 200) throw new Exception("HTTP " + status);
            break;
        }
        File dir = new File(getContext().getCacheDir(), "update");
        dir.mkdirs();
        File apk = new File(dir, "Chordash-update.apk");
        long total = connection.getContentLengthLong();
        long done = 0;
        int lastPercent = -1;
        try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
                done += read;
                if (total > 0) {
                    int percent = (int) (done * 100 / total);
                    if (percent != lastPercent) {
                        lastPercent = percent;
                        JSObject progress = new JSObject();
                        progress.put("percent", percent);
                        notifyListeners("progress", progress);
                    }
                }
            }
        } finally {
            connection.disconnect();
        }
        return apk;
    }
}
