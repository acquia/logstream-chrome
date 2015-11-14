/*
chrome.webRequest.onBeforeSendHeaders.addListener(
    function(data) {
        // Move these functions out of the callback
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        function uuid() {
            return 'acquibug-' + s4() + '-' + s4() + '-' + s4() + '-' +
                s4() + s4() + s4();
        }
        data.requestHeaders.push({
                name: 'X-Request-ID',
                value: uuid(),
        });
        return {requestHeaders: data.requestHeaders};
    },
    {urls: ['<all_urls>']}, // Filter URLs here or match on data.url above. Will need to get all domains that the user can access in order to do this, or only do it for the active tab when log streaming is connected
    ['blocking', 'requestHeaders']
);
*/

// Open the options page when the user clicks on an options link.
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request === 'openOptionsPage') {
        // Chrome 42+ (2015-04-14)
        if (typeof chrome.runtime.openOptionsPage === 'function') {
            chrome.runtime.openOptionsPage();
        }
        // Earlier Chrome versions
        else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    }
});
