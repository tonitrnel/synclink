export const featureCheck = (feature: 'subtle' | 'clipboard') => {
    const supported = (() => {
        switch (feature) {
            case 'subtle':
                return 'subtle' in crypto;
            case 'clipboard':
                return 'clipboard' in navigator;
            default:
                return true;
        }
    })();
    if (!supported) {
        if (window.location.protocol == 'http:') {
            throw new Error('Only available over HTTPS');
        } else {
            throw new Error('Browser version too low');
        }
    }
};
