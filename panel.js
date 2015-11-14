/**
 * Streams logs.
 *
 * By Isaac Sukin (IceCreamYou) 2015.
 */
(function() {

// The translation dictionary to use.
var dict = {};

/**
 * Translates strings.
 */
function t(s, replacements) {
    if (typeof dict[s] === 'string') {
        s = dict[s];
    }
    return typeof replacements === 'undefined' ? s : s.replace(/%(\w+)/g, function(match, word) {
        return replacements.hasOwnProperty(word) ? replacements[word] : match;
    });
}

var LOG_NAMES = {
    'apache-error':    t('Apache error'),
    'apache-request':  t('Apache request'),
    'bal-request':     t('Balancer request'),
    'drupal-request':  t('Drupal request'),
    'drupal-watchdog': t('Drupal watchdog'),
    'mysql-slow':      t('MySQL slow query'),
    'php-error':       t('PHP error'),
    'varnish-request': t('Varnish request'),
    'null':            t('debug'),
    'debug':           t('debug'),
    'info':            t('info'),
};

// Holds information about the available log types.
var logTypes = {};

// This works because we load the script after the container element
var container = document.getElementById('content');

// Whether to show debug messages
var debug = false;

/**
 * Write message to devtools panel.
 */
var showMessage = (function() {
    var elemCount = 0;
    return function(datetime, type, s) {
        var el = document.createElement('div'),
            dt = document.createElement('span'),
            ty = document.createElement('span'),
            tx = document.createElement('span'),
            args = Array.prototype.slice.call(arguments, 3);
        args.push('message', 'collapsed', type);
        el.classList.add.apply(el.classList, args);
        dt.classList.add('datetime');
        ty.classList.add('type');
        dt.textContent = datetime ? datetime : new Date().toISOString().replace('T', ' ').replace(/\.\d+\Z$/, '');
        ty.textContent = LOG_NAMES[type+''];
        tx.textContent = s;
        el.appendChild(dt);
        el.appendChild(ty);
        el.innerHTML += tx.textContent;
        container.insertBefore(el, container.firstChild);
        if (++elemCount > 100) {
            container.removeChild(container.lastChild);
            elemCount--;
        }
    };
})();

/**
 * Holds Acquia Cloud API credentials.
 */
function CloudAPI(user, pass) {
    this.user = user;
    this.pass = pass;
}

/**
 * Retrieve info from the Acquia Cloud API.
 */
CloudAPI.prototype.request = function(path, success, failure) {
    var url = 'https://cloudapi.acquia.com/v1/' + path + '.json',
        xhr = new XMLHttpRequest();
    xhr.open('GET', url, true, this.user, this.pass);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === xhr.DONE) {
            if (xhr.status === 200) {
                success(JSON.parse(xhr.responseText));
            }
            else {
                failure(xhr);
            }
        }
    };
    xhr.setRequestHeader('Authorization', 'Basic ' + btoa(this.user + ':' + this.pass));
    xhr.send(null);
};

/**
 * Set up.
 */
window.addEventListener('load', function() {
    // Don't allow submitting the form.
    document.getElementById('controls').addEventListener('submit', function(event) {
        event.preventDefault();
    });

    chrome.storage.local.get({
            'acquia-logstream.username': '',
            'acquia-logstream.password': '',
            'acquia-logstream.sitename': '',
            'acquia-logstream.environment': '',
            'acquia-logstream.debug': debug,
            'acquia-logstream.sitelist': JSON.stringify({}), // {SITENAME: {ENVIRONMENT: {domains: [''], lastUpdated: lastUpdatedTimestamp}, lastUpdated: lastUpdatedTimestamp}}
        },
        function(items) {
            if (typeof chrome.runtime.lastError === 'string') {
                showMessage(null, 'debug', t(
                    'Retrieving your saved settings failed with the error: %error',
                    { error: chrome.runtime.lastError }
                ), 'extension-error');
            }

            var user = items['acquia-logstream.username'],
                pass = items['acquia-logstream.password'];
            if (!user || !pass) {
                return document.getElementById('credentials-error').classList.remove('hidden');
            }

            debug = items['acquia-logstream.debug'];
            document.getElementById('show-debug').checked = debug;

            var cloud = new CloudAPI(user, pass),
                sitenameElement = document.getElementById('sitename'),
                environmentElement = document.getElementById('environment'),
                sitelist = JSON.parse(items['acquia-logstream.sitelist']);

            // Update the environment list when the site changes.
            sitenameElement.addEventListener('change', function() {
                var sitenameValue = sitenameElement.value;
                // TODO: Load environments from cache if possible before making the request, and save them to cache after retrieving them.
                cloud.request(
                    'sites/' + sitenameValue + '/envs',
                    function(envs) {
                        if (!envs.length) {
                            return showMessage(null, 'info', t(
                                'The site "%site" does not have any environments yet.',
                                { site: sitenameValue }
                            ), 'extension-error');
                        }
                        // Add the list of available environments as <option>s.
                        var envOptions = document.createDocumentFragment(),
                            prod = '',
                            lastSelection = '',
                            op,
                            cacheIsDirty = false;
                        for (var i = 0, l = envs.length; i < l; i++) {
                            var envName = envs[i].name;
                            op = document.createElement('option');
                            op.value = envName;
                            op.textContent = envName;
                            envOptions.appendChild(op);
                            // 'live01' is the default name of prod in ACSF
                            if (envName === 'prod' || envName.indexOf('live01') === 0) {
                                prod = envName;
                            }
                            if (envName === items['acquia-logstream.environment']) {
                                lastSelection = envName;
                            }
                            // TODO fix this. Just set environments to the returned environments list and then add details back in? Otherwise make sure we remove stale records.
                            try {
                                if (sitelist[sitenameValue].environments.indexOf(envName) === -1) {
                                    sitelist[site].environments.push(envName);
                                    cacheIsDirty = true;
                                }
                            }
                            catch(e) {
                                showMessage(null, 'debug', t('Unable to cache the association between the site "%site" and the environment "%environment": %err', {
                                    site: sitenameValue,
                                    environment: envName,
                                    err: e,
                                }), 'extension-error');
                            }
                        }
                        environmentElement.appendChild(envOptions);
                        environmentElement.value = lastSelection || prod || (envs.length ? sitenameElement.options[0].value : items['acquia-logstream.environment']);
                        if (cacheIsDirty) {
                            chrome.storage.local.set({'acquia-logstream.sitelist': JSON.stringify(sitelist)});
                        }
                        // Now that the sitenames and environments are populated, try to set them to the domain with which they're associated.
                        chrome.devtools.inspectedWindow.eval("window.location.hostname", function(domain, error) {
                            if (error) {
                                showMessage(null, 'debug', t('Unable to get current hostname: %error', {error: error}), 'extension-error');
                            }
                            else {
                                // TODO search the sitelist object for a domain that matches the hostname and set sitenameElement and environmentElement as appropriate
                            }
                        });
                    },
                    function(xhr) {
                        environmentElement.value = items['acquia-logstream.environment'] || 'prod';
                        showMessage(null, 'debug', t(
                            'Retrieving environments for site "%site" failed.',
                            { site: sitenameValue }
                        ), 'extension-error');
                    }
                );
            });

            // TODO Load sites from cache if possible before making the request.
            cloud.request(
                'sites',
                function(sites) {
                    if (!sites.length) {
                        return showMessage(null, 'info', t(
                            'You do not have access to any sites on Acquia Cloud. To stream logs, create a site at https://insight.acquia.com/subscriptions/add or ask an administrator for a site you work on to give you access.'
                        ), 'extension-error');
                    }
                    // Add the list of available sites as <option>s.
                    var siteOptions = document.createDocumentFragment(),
                        op,
                        now = Date.now();
                    for (var i = 0, l = sites.length; i < l; i++) {
                        var sitename = sites[i];
                        op = document.createElement('option');
                        op.value = sitename;
                        op.textContent = sitename;
                        siteOptions.appendChild(op);
                        if (typeof sitelist[sitename] === 'undefined') {
                            sitelist[sitename] = {domains:[], environments: {}, lastUpdated: now}; // TODO fix this
                        }
                        else {
                            sitelist[sitename].lastUpdated = now;
                        }
                    }
                    sitenameElement.appendChild(siteOptions);
                    sitenameElement.value = items['acquia-logstream.sitename'] || sitenameElement.options[0].value;
                    sitenameElement.dispatchEvent(new Event('change', {bubbles: true, cancelable: false}));
                    // Remove cached sites that aren't in the newly retrieved list.
                    for (var site in sitelist) {
                        if (sitelist.hasOwnProperty(site) && sitelist[site].lastUpdated !== now) {
                            delete sitelist[site];
                        }
                    }
                    // Save the updated site values to the cache.
                    chrome.storage.local.set({'acquia-logstream.sitelist': JSON.stringify(sitelist)});
                },
                function(xhr) {
                    sitenameElement.value = items['acquia-logstream.sitename'];
                    environmentElement.value = items['acquia-logstream.environment'] || 'prod';
                    showMessage(null, 'info', t(
                        'Retrieving sites failed.'
                    ), 'extension-error');
                }
            );

            // (Dis)connect when the button is clicked.
            var ws;
            document.getElementById('connect').addEventListener('click', function(event) {
                event.preventDefault();
                if (typeof ws === 'undefined' || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
                    var site = sitenameElement.value,
                        env  = environmentElement.value,
                        connectButton = this;

                    if (!site) {
                        alert(t('You must choose a valid sitename from which to stream logs.'));
                        return;
                    }
                    if (!env) {
                        alert(t('You must choose a valid environment from which to stream logs.'));
                        return;
                    }

                    showMessage(null, 'info', t('Connecting...'));
                    cloud.request(
                        'sites/' + site + '/envs/' + env + '/logstream',
                        function(connectionInfo) {
                            ws = setupWebSocket(connectionInfo);
                            connectButton.value = t('Stop streaming');
                        },
                        function(xhr) {
                            showMessage(null, 'info', t('Unable to retrieve connection info. %status: %response', {
                                status: xhr.statusText,
                                response: xhr.responseText,
                            }), 'extension-error');
                            try {
                                ws.close();
                            }
                            catch(e) {}
                        }
                    );
                }
                else { // ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING
                    ws.close();
                    this.value = t('Reconnect');
                }
            });
        }
    );

    // Save the most recent sitename.
    document.getElementById('sitename').addEventListener('blur', function() {
        chrome.storage.local.set({'acquia-logstream.sitename': this.value});
    });

    // Save the most recent environment.
    document.getElementById('environment').addEventListener('blur', function() {
        chrome.storage.local.set({'acquia-logstream.environment': this.value});
        // TODO cache the list of domains for this environment so we can try to set sitename and environment automatically.
        // cloud.request('sites/$SITENAME/envs/$ENV/domains')
    });

    // Change whether debug messages are shown when the checkbox value changes.
    document.getElementById('show-debug').addEventListener('change', function() {
        debug = this.checked;
        chrome.storage.local.set({'acquia-logstream.debug': this.checked});
    });

    // Set which log types to filter when the "Show log types" option changes.
    document.getElementById('logtypes').addEventListener('change', function(event) {
        var o = event.target.options;
        for (var i = 0, l = o.length; i < l; i++) {
            if (typeof logTypes[o[i].value] === 'object') {
                logTypes[o[i].value].enabled = o[i].selected;
            }
        }
    });

    // Expand log message when clicked
    container.addEventListener('click', function(event) {
        if (event.target.classList.contains('message')) {
            event.target.classList.remove('collapsed');
        }
    });

    // Hide the credentials error if the credentials are added.
    function hideCredentialsError(items) {
        if (items['acquia-logstream.username'] && items['acquia-logstream.password']) {
            document.getElementById('credentials-error').classList.add('hidden');
        }
    }
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        for (var key in changes) {
            if (namespace === 'local' && (key === 'acquia-logstream.username' || key === 'acquia-logstream.password')) {
                // TODO Reset the list of sites/environments.
                return chrome.storage.local.get({
                    'acquia-logstream.username': '',
                    'acquia-logstream.password': '',
                }, hideCredentialsError);
            }
        }
    });

    // Open the settings when a settings link is clicked.
    document.getElementById('controls').addEventListener('click', function(event) {
        if (event.target.classList.contains('options-link')) {
            event.preventDefault();
            chrome.runtime.sendMessage('openOptionsPage');
        }
    });
});

function setupWebSocket(connectionInfo) {
    var ws = new WebSocket(connectionInfo.url);

    ws.onopen = function() {
        if (debug) {
            showMessage(null, 'debug', connectionInfo.msg, 'sent');
        }
        showMessage(null, 'info', t('Connected successfully.'));
        ws.send(connectionInfo.msg);
    };

    ws.onmessage = function(event) {
        try {
            var data = JSON.parse(event.data);
            if (['connected', 'error', 'success'].indexOf(data.cmd) > -1 && debug) {
                showMessage(null, 'debug', event.data, 'received');
            }
            else if (data.cmd === 'available') {
                if (debug) {
                    showMessage(null, 'debug', event.data, 'received');
                }
                if (typeof logTypes[data.type] === 'undefined') {
                    logTypes[data.type] = {
                        enabled: true,
                        servers: [data.server],
                    };
                    var op = document.createElement('option');
                    op.setAttribute('selected', '');
                    op.textContent = data.type;
                    document.getElementById('logtypes').appendChild(op);
                }
                else {
                    logTypes[data.type].servers.push(data.server);
                }
                if (logTypes[data.type].enabled) {
                    var msg = JSON.stringify({
                        cmd: 'enable',
                        type: data.type,
                        server: data.server,
                    });
                    if (debug) {
                        showMessage(null, 'debug', msg, 'sent');
                    }
                    ws.send(msg);
                }
            }
            else if (data.cmd === 'line') {
                if (logTypes[data.log_type].enabled) {
                    if (typeof data.http_status !== 'undefined') {
                        var status = data.http_status < 400 ? 200 : 100 * Math.floor(data.http_status / 100);
                        showMessage(data.disp_time, data.log_type, data.text, 'log', 'http-status-' + status);
                    }
                    else {
                        showMessage(data.disp_time, data.log_type, data.text, 'log');
                    }
                }
            }
        }
        catch(e) {
            showMessage(null, 'debug', t(
                'Error receiving event: %error',
                { error: e+'' }
            ), 'extension-error');
        }
    };

    ws.onclose = function() {
        if (debug) {
            showMessage(null, 'debug', t('Connection closed'));
        }
        document.getElementById('connect').value = t('Reconnect');
    };

    ws.onerror = function() {
        showMessage(null, 'info', t('Connection error'), 'extension-error');
    };

    return ws;
}

}).call(this);
