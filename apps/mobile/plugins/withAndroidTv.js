const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ensureFeature = (manifest, name, required) => {
  manifest['uses-feature'] = manifest['uses-feature'] || [];
  const existing = manifest['uses-feature'].find((feature) => feature.$?.['android:name'] === name);
  if (existing) {
    existing.$['android:required'] = required;
    return;
  }
  manifest['uses-feature'].push({
    $: {
      'android:name': name,
      'android:required': required,
    },
  });
};

const ensureLeanbackLauncher = (activity) => {
  activity['intent-filter'] = activity['intent-filter'] || [];
  let launcherFilter = activity['intent-filter'].find((filter) => {
    const actions = filter.action || [];
    return actions.some((action) => action.$?.['android:name'] === 'android.intent.action.MAIN');
  });

  if (!launcherFilter) {
    launcherFilter = {
      action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
      category: [],
    };
    activity['intent-filter'].push(launcherFilter);
  }

  launcherFilter.category = launcherFilter.category || [];
  const hasLeanback = launcherFilter.category.some(
    (category) => category.$?.['android:name'] === 'android.intent.category.LEANBACK_LAUNCHER'
  );
  if (!hasLeanback) {
    launcherFilter.category.push({
      $: { 'android:name': 'android.intent.category.LEANBACK_LAUNCHER' },
    });
  }
};

const bannerXml = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="320dp"
    android:height="180dp"
    android:viewportWidth="320"
    android:viewportHeight="180">
  <path android:fillColor="#090909" android:pathData="M0,0h320v180h-320z" />
  <path android:fillColor="#FFFFFF" android:pathData="M133,52 L133,128 L204,90 Z" />
  <path android:fillColor="#33FFFFFF" android:pathData="M42,148h236v2h-236z" />
</vector>
`;

const withAndroidTv = (config) => {
  config = withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    ensureFeature(manifest, 'android.software.leanback', 'false');
    ensureFeature(manifest, 'android.hardware.touchscreen', 'false');

    const application = manifest.application?.[0];
    if (application?.$) {
      application.$['android:banner'] = '@drawable/tv_banner';
      const mainActivity = application.activity?.find((activity) =>
        String(activity.$?.['android:name'] || '').includes('MainActivity')
      );
      if (mainActivity) ensureLeanbackLauncher(mainActivity);
    }

    return manifestConfig;
  });

  config = withDangerousMod(config, ['android', (modConfig) => {
    const drawableDir = path.join(
      modConfig.modRequest.platformProjectRoot,
      'app',
      'src',
      'main',
      'res',
      'drawable'
    );
    fs.mkdirSync(drawableDir, { recursive: true });
    fs.writeFileSync(path.join(drawableDir, 'tv_banner.xml'), bannerXml);
    return modConfig;
  }]);

  return config;
};

module.exports = withAndroidTv;
