export const getDeviceType = (userAgent: string) => {
  const isMobile =
    /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet =
    /ipad|tablet|playbook|silk|kindle|kftt|kfjw|kfsowi|kfpw|kfthwi|kfthwa|kfapwi|kftbwi|kfgi|nexus 7|nexus 10|galaxy tab|xoom|sch-i800|android(?!.*mobile)/i.test(
      userAgent,
    );
  const isDesktop = /macintosh|windows nt|linux/i.test(userAgent);
  if (isMobile) {
    return 'mobile';
  } else if (isTablet) {
    return 'tablet';
  } else if (isDesktop) {
    return 'desktop';
  } else {
    return 'unknown';
  }
};
export const getBrowserInfo = (uaString: string) => {
  const ua = uaString.toLowerCase();
  let browser, version, os;

  // 检测浏览器和版本
  if (ua.indexOf('firefox') > -1) {
    browser = 'Firefox';
    version = ua.match(/firefox\/([\d.]+)/)?.[1];
  } else if (
    ua.indexOf('chrome') > -1 &&
    ua.indexOf('edg') === -1 &&
    ua.indexOf('opr') === -1
  ) {
    browser = 'Chrome';
    version = ua.match(/chrome\/([\d.]+)/)?.[1];
  } else if (ua.indexOf('safari') > -1 && ua.indexOf('chrome') === -1) {
    browser = 'Safari';
    version = ua.match(/version\/([\d.]+)/)?.[1];
  } else if (ua.indexOf('opr') > -1 || ua.indexOf('opera') > -1) {
    browser = 'Opera';
    version = ua.match(/(opr|opera)\/([\d.]+)/)?.[2];
  } else if (ua.indexOf('edg') > -1) {
    browser = 'Edge';
    version = ua.match(/edg\/([\d.]+)/)?.[1];
  } else if (ua.indexOf('msie') > -1 || ua.indexOf('trident') > -1) {
    browser = 'Internet Explorer';
    version = ua.match(/(msie|rv:)([\d.]+)/)?.[2];
  } else {
    browser = undefined;
    version = undefined;
  }

  // 检测操作系统
  if (ua.indexOf('windows nt') > -1) {
    os = 'Windows';
  } else if (ua.indexOf('mac os x') > -1) {
    os = 'Mac OS';
  } else if (ua.indexOf('android') > -1) {
    os = 'Android';
  } else if (ua.indexOf('linux') > -1) {
    os = 'Linux';
  } else if (ua.indexOf('iphone') > -1 || ua.indexOf('ipad') > -1) {
    os = 'iOS';
  } else {
    os = undefined;
  }
  if (browser == undefined || os == undefined) return void 0;
  return {
    browser: browser,
    version: version,
    os: os,
  };
};
