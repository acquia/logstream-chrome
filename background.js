(function() {

// Whether to send the X-Request-ID header with each request.
var onlyMe = false;

/**
 * Quickly returns a random UUID that is compliant with RFC-4122 Version 4.
 *
 * An example result is "2c3fa383-0d9d-4104-8fa2-58fdf614f021"
 *
 * This is a modified version of this StackOverflow answer by Jeff Ward:
 * http://stackoverflow.com/a/21963136/843621
 */
var uuid = (function() {
    var lut = [], // look-up table to convert decimals (0-256) to hexadecimals (0x00-0xff)
        buf = new Uint32Array(4); // random value buffer
    for (var i = 0; i < 256; i++) {
        lut[i] = (i < 16 ? '0' : '') + (i).toString(16);
    }
    return function() {
        window.crypto.getRandomValues(buf);
        var d0 = buf[0],
            d1 = buf[1],
            d2 = buf[2],
            d3 = buf[3];
        return lut[d0&0xff]     +lut[d0>>8&0xff]    +lut[d0>>16&0xff]     +lut[d0>>24&0xff]+'-'+
               lut[d1&0xff]     +lut[d1>>8&0xff]+'-'+lut[d1>>16&0x0f|0x40]+lut[d1>>24&0xff]+'-'+
               lut[d2&0x3f|0x80]+lut[d2>>8&0xff]+'-'+lut[d2>>16&0xff]     +lut[d2>>24&0xff]+
               lut[d3&0xff]     +lut[d3>>8&0xff]    +lut[d3>>16&0xff]     +lut[d3>>24&0xff];
    };
})();

/**
 * Retrieve information from the Acquia Cloud API.
 *
 * @param {String} user
 *   The username of the account requesting the information.
 * @param {String} pass
 *   The password of the account requesting the information.
 * @param {String} path
 *   The resource being requested. This is used to construct the API endpoint
 *   from which the information is retrieved, like this:
 *   `'https://cloudapi.acquia.com/v1/' + path + '.json'`
 * @param {Function} sendResponse
 *   A callback to which the result of the request should be sent.
 */
function getCloudInfo(user, pass, path, sendResponse) {
    var url = 'https://cloudapi.acquia.com/v1/' + path + '.json',
        xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === xhr.DONE) {
            sendResponse({
                responseText: xhr.responseText,
                status: xhr.status,
                statusText: xhr.statusText,
            });
        }
    };
    xhr.setRequestHeader('Authorization', 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass))));
    xhr.send(null);
}

/*
 * Add the X-Request-ID header to each request while we're tracking requests.
 *
 * X-Request-ID is specified at https://docs.acquia.com/cloud/manage/requestid
 * as a string that matches the regex /^[a-zA-Z0-9+/=-]{20,200}$/.
 */
chrome.webRequest.onBeforeSendHeaders.addListener(
    function(data) {
        if (!onlyMe) {
            return;
        }
        data.requestHeaders.push({
            name: 'X-Request-ID',
            value: 'ac-ls-ce-' + onlyMe + '-' + uuid(),
        });
        return {requestHeaders: data.requestHeaders};
    },
    {urls: ['<all_urls>']},
    ['blocking', 'requestHeaders']
);

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // Open the options page when the user clicks on an options link.
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
    // Enable sending the X-Request-ID header with a specific UUID to track the
    // current user's requests through the logs.
    else if (request === 'enableRequestHeaders') {
        onlyMe = uuid();
        sendResponse(onlyMe);
    }
    // Stop tracking the current user's requests.
    else if (request === 'disableRequestHeaders') {
        onlyMe = false;
    }
    // Retrieve information from the Acquia Cloud API.
    else if (request !== null && request.method === 'getCloudInfo') {
        getCloudInfo(request.user, request.pass, request.path, sendResponse);
        return true;
    }
});

}).call(this);
