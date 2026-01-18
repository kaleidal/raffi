const { withAndroidManifest, withMainApplication, withAppBuildGradle, withSettingsGradle } = require('@expo/config-plugins');

/**
 * Expo Config Plugin for TorrentStreamer native module
 * 
 * This plugin:
 * 1. Adds required permissions to AndroidManifest.xml
 * 2. Registers the native module package in MainApplication
 * 3. Adds the libtorrent4j dependencies to build.gradle
 * 4. Includes the torrent-streamer module in settings.gradle
 */
const withTorrentStreamer = (config) => {
  // Add Android permissions
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const manifest = androidManifest.manifest;
    
    // Ensure permissions array exists
    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    
    // Add permissions if not already present
    const permissions = [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_EXTERNAL_STORAGE',
    ];
    
    permissions.forEach(permission => {
      const exists = manifest['uses-permission'].some(
        p => p.$['android:name'] === permission
      );
      if (!exists) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission }
        });
      }
    });
    
    return config;
  });

  // Add to MainApplication
  config = withMainApplication(config, async (config) => {
    const mainApplication = config.modResults;
    
    // Add import
    if (!mainApplication.contents.includes('import al.kaleid.raffimobile.torrent.TorrentStreamerPackage')) {
      mainApplication.contents = mainApplication.contents.replace(
        'import java.util.List;',
        `import java.util.List;
import al.kaleid.raffimobile.torrent.TorrentStreamerPackage;`
      );
    }
    
    // Add package to getPackages()
    if (!mainApplication.contents.includes('new TorrentStreamerPackage()')) {
      mainApplication.contents = mainApplication.contents.replace(
        'return packages;',
        `packages.add(new TorrentStreamerPackage());
        return packages;`
      );
    }
    
    return config;
  });

  // Add to build.gradle - use libtorrent4j instead of TorrentStream-Android
  config = withAppBuildGradle(config, async (config) => {
    const buildGradle = config.modResults;
    
    // Add libtorrent4j dependencies if not already present
    if (!buildGradle.contents.includes('libtorrent4j')) {
      buildGradle.contents = buildGradle.contents.replace(
        'dependencies {',
        `dependencies {
    // libtorrent4j - direct libtorrent binding for Android/Java
    implementation 'org.libtorrent4j:libtorrent4j:2.1.0-31'
    implementation 'org.libtorrent4j:libtorrent4j-android-arm64:2.1.0-31'
    implementation 'org.libtorrent4j:libtorrent4j-android-arm:2.1.0-31'
    // NanoHTTPD for local HTTP server
    implementation 'org.nanohttpd:nanohttpd:2.3.1'`
      );
    }
    
    return config;
  });

  // Include the torrent-streamer module in settings.gradle
  config = withSettingsGradle(config, async (config) => {
    const settingsGradle = config.modResults;
    
    if (!settingsGradle.contents.includes("':torrent-streamer'")) {
      settingsGradle.contents += `
include ':torrent-streamer'
project(':torrent-streamer').projectDir = new File(rootProject.projectDir, '../modules/torrent-streamer/android')
`;
    }
    
    return config;
  });

  return config;
};

module.exports = withTorrentStreamer;
