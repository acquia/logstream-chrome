(function() {

var checkCreds = (function() {
    // Keep track of the request so that we only manage one at a time.
    var xhr;

    /**
     * Check whether Acquia credentials successfully authenticate.
     *
     * @param {String} user
     *   The email address (username) of the authenticating user.
     * @param {String} pass
     *   The password of the authenticating user.
     * @param {Function} callback
     *   A function to call when the request completes. Receives one parameter:
     *   a Boolean indicating whether the request succeeded (indicating that
     *   authentication with the credentials was successful).
     */
    return function checkCreds(user, pass, callback) {
        if (!xhr) {
            xhr = new XMLHttpRequest();
        }
        // Abort active requests so that we only check the most recent creds.
        if (xhr.readyState !== xhr.UNSENT && xhr.readyState !== xhr.DONE) {
            xhr.abort();
        }
        // HEAD requests have lower overhead than GET requests.
        xhr.open('HEAD', 'https://cloudapi.acquia.com/v1/sites.json', true, user, pass);
        xhr.onreadystatechange = function() {
            if (xhr.readyState === xhr.DONE) {
                // If the connection is aborted, the status is zero.
                // Only react if the request actually completed.
                if (xhr.status) {
                    callback(xhr.status >= 200 && xhr.status < 400);
                    // Release the resource to free up memory.
                    xhr = undefined;
                }
            }
        };
        xhr.setRequestHeader('Authorization', 'Basic ' + btoa(user + ':' + pass));
        try {
            xhr.send(null);
        }
        catch(e) {
            // Ignore network errors thrown due to checking invalid creds.
            if (e.name !== 'NetworkError') {
                throw e;
            }
        }
    };
})();

// Set and save values. Uses local storage because the data is sensitive.
window.addEventListener('load', function() {
    // Don't allow submitting the form.
    document.getElementById('controls').addEventListener('submit', function(event) {
        event.preventDefault();
    });

    var userElement = document.getElementById('username'),
        passElement = document.getElementById('password'),
        checkingElement = document.getElementById('credsChecking'),
        successElement = document.getElementById('credsSuccess'),
        failureElement = document.getElementById('credsFailure'),
        t = chrome.i18n.getMessage;

    // Set username and password to their last values.
    chrome.storage.local.get({
            'acquia-logstream.username': '',
            'acquia-logstream.password': '',
        },
        function(items) {
            if (typeof chrome.runtime.lastError === 'string') {
                alert(t('errors_getCredentialsFailed', chrome.runtime.lastError));
            }
            userElement.value = items['acquia-logstream.username'];
            passElement.value = items['acquia-logstream.password'];
            onChangeCreds();
        }
    );

    // Save the most recent username.
    userElement.addEventListener('blur', function() {
        chrome.storage.local.set({'acquia-logstream.username': this.value});
    });

    // Save the most recent password.
    passElement.addEventListener('blur', function() {
        chrome.storage.local.set({'acquia-logstream.password': this.value});
    });

    // Check if the user's credentials successfully authenticate to Acquia.
    function onChangeCreds() {
        var user = userElement.value,
            pass = passElement.value;
        if (user && pass) {
            // TODO this is causing a popup creds window if the creds fail
            checkingElement.classList.toggle('visible',  true);
            successElement.classList.toggle('visible',  false);
            failureElement.classList.toggle('visible', false);
            checkCreds(user, pass, function(authSucceeded) {
                checkingElement.classList.toggle('visible',  false);
                successElement.classList.toggle('visible',  authSucceeded);
                failureElement.classList.toggle('visible', !authSucceeded);
            });
        }
        else {
            checkingElement.classList.toggle('visible',  false);
            successElement.classList.toggle('visible',  false);
            failureElement.classList.toggle('visible', false);
        }
    }
    userElement.addEventListener('input', onChangeCreds);
    passElement.addEventListener('input', onChangeCreds);
});

}).call(this);
