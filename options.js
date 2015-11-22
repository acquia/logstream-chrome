(function() {

// Set and save values. Uses local storage because the data is sensitive.
window.addEventListener('load', function() {
    // Don't allow submitting the form.
    document.getElementById('controls').addEventListener('submit', function(event) {
        event.preventDefault();
    });

    // Set username and password to their last values.
    chrome.storage.local.get({
            'acquia-logstream.username': '',
            'acquia-logstream.password': '',
        },
        function(items) {
            if (typeof chrome.runtime.lastError === 'string') {
                alert(chrome.i18n.getMessage('errors_getSettings', chrome.runtime.lastError));
            }
            document.getElementById('username').value = items['acquia-logstream.username'];
            document.getElementById('password').value = items['acquia-logstream.password'];
        }
    );

    // Save the most recent username.
    document.getElementById('username').addEventListener('blur', function() {
        chrome.storage.local.set({'acquia-logstream.username': this.value});
    });

    // Save the most recent password.
    document.getElementById('password').addEventListener('blur', function() {
        chrome.storage.local.set({'acquia-logstream.password': this.value});
    });
});

}).call(this);
