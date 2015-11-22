/**
 * Streams logs.
 *
 * By Isaac Sukin (IceCreamYou).
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

/**
 * Describes a type of log entry.
 *
 * @param {String/Object} options
 *   If a string is passed, that becomes the name of the log type. If an object
 *   is passed, the following properties will be used to set properties of the
 *   log type:
 *   - `{Boolean} [allowToggling=true]`: Whether this log type will show up in
 *     the list of log types in the UI so that it can be enabled and disabled.
 *   - `{Boolean} [enabled=true]`: Whether logs of this type will be shown in
 *     the stream or not by default.
 *   - `{String} name`: The name of the log type.
 */
function LogType(options) {
    if (typeof options === 'string') {
        this.name = options;
        options = {};
    }
    else {
        this.name = options.name;
    }
    this.allowToggling = typeof options.allowToggling === 'undefined' ? true : options.allowToggling;
    this.enabled = typeof options.enabled === 'undefined' ? true : options.enabled;
}

// Holds information about the available log types. These defaults are the ones
// that we expect to be available. The list will be updated based on what the
// servers advertise.
var logTypes = {
    'apache-error':    new LogType(t('Apache error')),
    'apache-request':  new LogType(t('Apache request')),
    'bal-request':     new LogType(t('Balancer request')),
    'drupal-request':  new LogType(t('Drupal request')),
    'drupal-watchdog': new LogType(t('Drupal watchdog')),
    'mysql-slow':      new LogType(t('MySQL slow query')),
    'php-error':       new LogType(t('PHP error')),
    'varnish-request': new LogType(t('Varnish request')),
    'debug':           new LogType({
        enabled: false,
        name: t('debug'),
    }),
    'info':            new LogType({
        allowToggling: false,
        name: t('info'),
    }),
};

// Whether to show only logs the current user generates.
// If truthy, may hold a regex which identifies requests the user generated.
var onlyMe = true;

// If we can detect that the current hostname matched a Cloud site, these will
// contain the sitename and environment of that site.
var domainMatchedSitename = '',
    domainMatchedEnvironment = '';

var showMessage = (function() {
    // This works because we load the script after the container element.
    var container = document.getElementById('content'),
        messageDate = new Date(),
        elemCount = 0,
        formatDate = new Intl.DateTimeFormat(new Intl.DateTimeFormat().resolvedOptions().locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
        }).format;

    /**
     * Log a message to the logstream devtools panel.
     *
     * @param {String} datetime
     *   The time at which the message was generated. If falsy, this is
     *   generated as the current time.
     * @param {String} type
     *   The type of message. Must match a key of `logTypes`.
     * @param {String} s
     *   The message to show.
     */
    return function showMessage(datetime, type, s) {
        if (!logTypes[type].enabled) {
            return;
        }
        var el = document.createElement('div'),
            dt = document.createElement('span'),
            ty = document.createElement('span'),
            tx = document.createElement('span'),
            args = Array.prototype.slice.call(arguments, 3);
        args.push('message', 'collapsed', type || 'debug');
        el.classList.add.apply(el.classList, args);
        dt.classList.add('datetime');
        ty.classList.add('type');
        try {
            messageDate.setTime(datetime ? Date.parse(datetime) : Date.now());
            dt.textContent = formatDate(messageDate);
        }
        catch(e) {
            dt.textContent = datetime;
        }
        ty.textContent = logTypes[type+''].name;
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
 * Logs a debug-level warning if retrieving values from storage failed.
 *
 * @param {String} message
 *   The message to log if an error occurred. If "%error" is found in the
 *   string, it will be replaced with the error message.
 */
function logIfError(message) {
    if (typeof chrome.runtime.lastError === 'string') {
        showMessage(null, 'debug', t(message, {
            error: chrome.runtime.lastError,
        }), 'extension-error', 'here');
        return true;
    }
}

function getCloudInfo(path, success, failure) {
    chrome.storage.local.get({
            'acquia-logstream.username': '',
            'acquia-logstream.password': '',
        },
        function(items) {
            logIfError('Retrieving saved Cloud API credentials failed with the error: %error');

            chrome.runtime.sendMessage({
                    method: 'getCloudInfo',
                    user: items['acquia-logstream.username'],
                    pass: items['acquia-logstream.password'],
                    path: path,
                },
                function(response) {
                    if (response.status === 200 || response.status === 204 || response.status === 304) {
                        success(JSON.parse(response.responseText));
                    }
                    else {
                        failure(response);
                    }
                }
            );
        }
    );
}

/**
 * Tear down.
 */
window.addEventListener('unload', function() {
    chrome.runtime.sendMessage('disableRequestHeaders');
});

/**
 * Set up.
 */
window.addEventListener('load', function() {
    // Don't allow submitting the form.
    document.getElementById('controls').addEventListener('submit', function(event) {
        event.preventDefault();
    });

    // Populates the options of the sitename select list.
    // If the `sitelist` parameter is not set, the `sites` list is from the cache.
    // Otherwise, it is from the Cloud API.
    function renderSitenameList(sites, sitelist, lastSitename) {
        if (!sites.length || (sites.length === 1 && sites[0] === 'lastUpdated')) {
            return;
        }
        // Add the list of available sites as <option>s.
        var sitenameElement = document.getElementById('sitename'),
            siteOptions = document.createDocumentFragment(),
            domainMatch = '',
            lastSelection = '',
            now = Date.now(),
            op;
        sites.sort();
        for (var i = 0, l = sites.length; i < l; i++) {
            var sitename = sites[i];
            // Sitenames are all lower case by convention,
            // so there shouldn't be any environments named lastUpdated.
            if (sitename === 'lastUpdated') {
                continue;
            }
            op = document.createElement('option');
            op.value = sitename;
            op.textContent = sitename;
            siteOptions.appendChild(op);
            if (sitename === lastSitename) {
                lastSelection = sitename;
            }
            if (sitename === domainMatchedSitename) {
                domainMatch = sitename;
            }
            if (sitelist && typeof sitelist === 'object') {
                if (typeof sitelist[sitename] === 'undefined') {
                    sitelist[sitename] = {lastUpdated: now};
                }
                else {
                    sitelist[sitename].lastUpdated = now;
                }
            }
        }
        sitenameElement.innerHTML = '';
        sitenameElement.appendChild(siteOptions);
        sitenameElement.value = domainMatch || lastSelection || sitenameElement.options[0].value;
        sitenameElement.dispatchEvent(new Event('change', {bubbles: true, cancelable: false}));
        if (sitelist) {
            // Remove cached sites that aren't in the newly retrieved list.
            for (var site in sitelist) {
                if (sitelist.hasOwnProperty(site) && typeof sitelist[site] === 'object' && sitelist[site].lastUpdated !== now) {
                    delete sitelist[site];
                }
            }
        }
    }

    // Populates the options of the sitename select list from the cache and remotely.
    function resetSitenameList(sitelist, lastSitename) {
        // Load from cache for speed.
        renderSitenameList(Object.keys(sitelist), null, lastSitename);
        // Refresh from Cloud.
        showMessage(null, 'debug', t('Refreshing site list...'), 'sent');
        getCloudInfo(
            'sites',
            function(sites) {
                if (!sites.length) {
                    return showMessage(null, 'info', t(
                        'You do not have access to any sites on Acquia Cloud. ' +
                        'To stream logs, create a site at https://insight.acquia.com/subscriptions/add ' +
                        'or ask an administrator for a site you work on to give you access.'
                    ), 'extension-error');
                }
                renderSitenameList(sites, sitelist, lastSitename);
                showMessage(null, 'debug', t('Site list refreshed successfully.'), 'received');
                chrome.storage.local.set({'acquia-logstream.sitelist': JSON.stringify(sitelist)});
            },
            function(xhr) {
                // This is marked as "info" instead of "debug" because something pretty fundamental is probably wrong if this request fails.
                showMessage(null, 'info', t('Refreshing the site list failed with status %status: %response', {
                    status: xhr.statusText,
                    response: xhr.responseText,
                }), 'extension-error');
            }
        );
    }

    // Populates the options of the environment select list.
    // If the `site` parameter is not set, the `envs` list is from the cache.
    // Otherwise, it is from the Cloud API.
    function renderEnvironmentList(envs, site, lastEnvName) {
        if (!envs.length || (envs.length === 1 && envs[0] === 'lastUpdated')) {
            return;
        }
        // Add the list of available environments as <option>s.
        var environmentElement = document.getElementById('environment'),
            envOptions = document.createDocumentFragment(),
            prod = '',
            dev = '',
            domainMatch = '',
            lastSelection = '',
            now = Date.now(),
            op,
            envOrder = ['dev', 'test', 'prod', 'live01', 'ra'];
        envs.sort(function(a, b) {
            if (a === b) return 0;
            for (var i = 0; i < envOrder.length; i++) {
                if (a === envOrder[i]) return -1;
                else if (b === envOrder[i]) return 1;
            }
            return a.localeCompare(b);
        });
        for (var i = 0, l = envs.length; i < l; i++) {
            var envName = envs[i];
            // Environment names are all lower case by convention,
            // so there shouldn't be any environments named lastUpdated.
            if (envName === 'lastUpdated') {
                continue;
            }
            op = document.createElement('option');
            op.value = envName;
            op.textContent = envName;
            envOptions.appendChild(op);
            // 'live01' is the default name of prod in ACSF
            if (envName === 'prod' || envName.indexOf('live01') === 0) {
                prod = envName;
            }
            if (envName === 'dev') {
                dev = envName;
            }
            if (envName === lastEnvName) {
                lastSelection = envName;
            }
            if (envName === domainMatchedEnvironment) {
                domainMatch = envName;
            }
            if (site && typeof site === 'object') {
                if (typeof site[envName] === 'undefined') {
                    site[envName] = {lastUpdated: now};
                }
                else {
                    site[envName].lastUpdated = now;
                }
            }
        }
        environmentElement.innerHTML = '';
        environmentElement.appendChild(envOptions);
        environmentElement.value = domainMatch || lastSelection || prod || dev || environmentElement.options[0].value;
        environmentElement.dispatchEvent(new Event('change', {bubbles: true, cancelable: false}));
        if (site) {
            // Remove cached environments that aren't in the newly retrieved list.
            for (var env in site) {
                if (site.hasOwnProperty(env) && typeof site[env] === 'object' && site[env].lastUpdated !== now) {
                    delete site[env];
                }
            }
        }
    }

    // Populates the options of the environment select list from the cache and remotely.
    function resetEnvironmentList(sitename, sitelist, lastEnvName) {
        // Load from cache for speed.
        renderEnvironmentList(Object.keys(sitelist[sitename]), null, lastEnvName);
        // Refresh from Cloud.
        showMessage(null, 'debug', t('Refreshing environments list for site "%site"...', {site: sitename}), 'sent');
        getCloudInfo(
            'sites/' + sitename + '/envs',
            function(envs) {
                if (!envs.length) {
                    return showMessage(null, 'info', t(
                        'The site "%site" does not have any environments yet.',
                        { site: sitename }
                    ), 'extension-error');
                }
                renderEnvironmentList(envs.map(function(env) {
                    return env.name;
                }), sitelist[sitename], lastEnvName);
                chrome.storage.local.set({'acquia-logstream.sitelist': JSON.stringify(sitelist)});
                showMessage(null, 'debug', t('Environment list refreshed successfully.'), 'received');
            },
            function(xhr) {
                showMessage(null, 'debug', t('Retrieving environments for site "%site" failed. %status: %response', {
                    site: sitename,
                    status: xhr.statusText,
                    response: xhr.responseText,
                }), 'extension-error', xhr.status >= 400 && xhr.status < 500 ? 'sent' : 'received');
            }
        );
    }

    function sendRequestHeaderStatus() {
        if (onlyMe) {
            chrome.runtime.sendMessage('enableRequestHeaders', function(uuid) {
                onlyMe = new RegExp('request_id="ac-ls-ce-' + uuid + "-[0-9a-f-]{36}");
            });
        }
        else {
            chrome.runtime.sendMessage('disableRequestHeaders');
        }
    }

    chrome.storage.local.get({
            'acquia-logstream.sitename': '',
            'acquia-logstream.environment': '',
            'acquia-logstream.onlyme': onlyMe,
            'acquia-logstream.logtypes': JSON.stringify(logTypes),
            // Sitelist format is {SITENAME: {ENVIRONMENT: {lastUpdated: TIMESTAMP}, lastUpdated: TIMESTAMP}}
            'acquia-logstream.sitelist': JSON.stringify({}),
        },
        function(items) {
            logIfError('Retrieving your saved settings failed with the error: %error');

            onlyMe = items['acquia-logstream.onlyme'];
            document.getElementById('show-only-me').checked = !!onlyMe;
            sendRequestHeaderStatus();

            logTypes = JSON.parse(items['acquia-logstream.logtypes']);
            var logOptions = document.createDocumentFragment();
            for (var type in logTypes) {
                if (logTypes.hasOwnProperty(type) && logTypes[type].allowToggling) {
                    var op = document.createElement('option');
                    if (logTypes[type].enabled) {
                        op.setAttribute('selected', '');
                    }
                    op.value = type;
                    op.textContent = logTypes[type].name;
                    logOptions.appendChild(op);
                }
            }
            document.getElementById('logtypes').appendChild(logOptions);

            var sitelist = JSON.parse(items['acquia-logstream.sitelist']),
                lastSite;

            // Update the environment list when the site changes.
            document.getElementById('sitename').addEventListener('change', function() {
                var sitename = this.value;
                if (sitename === lastSite || !sitename) {
                    return;
                }
                lastSite = sitename;
                resetEnvironmentList(sitename, sitelist, items['acquia-logstream.environment']);
            });

            // Update the sitename list.
            resetSitenameList(sitelist, items['acquia-logstream.sitename']);

            // (Dis)connect when the button is clicked.
            var ws;
            document.getElementById('connect').addEventListener('click', function(event) {
                event.preventDefault();
                if (typeof ws === 'undefined' || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
                    var site = document.getElementById('sitename').value,
                        env  = document.getElementById('environment').value,
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
                    getCloudInfo(
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
    document.getElementById('sitename').addEventListener('change', function() {
        chrome.storage.local.set({'acquia-logstream.sitename': this.value});
    });

    // Save the most recent environment.
    document.getElementById('environment').addEventListener('change', function() {
        var sitename = document.getElementById('sitename').value,
            envName = this.value;
        if (!sitename || !envName) {
            return;
        }
        chrome.storage.local.set({'acquia-logstream.environment': envName});
        // Cache the list of domains for this environment.
        chrome.storage.local.get({
                // Domains format is {DOMAIN: {sitename: SITENAME, environment: ENVNAME}}
                'acquia-logstream.domains': JSON.stringify({}),
            },
            function(items) {
                if (logIfError('Saving the association between a domain and its sitename and environment failed with the error: %error')) {
                    return;
                }
                var domains = JSON.parse(items['acquia-logstream.domains']);
                getCloudInfo(
                    'sites/' + sitename + '/envs/' + envName + '/domains',
                    function(results) {
                        for (var i = 0, l = results.length; i < l; i++) {
                            domains[results[i].name] = {
                                sitename: sitename,
                                environment: envName,
                            };
                        }
                        chrome.storage.local.set({'acquia-logstream.domains': JSON.stringify(domains)});
                    },
                    function(xhr) {
                        showMessage(null, 'debug', t('Retrieving domains failed with status %status: %response', {
                            status: xhr.statusText,
                            response: xhr.responseText,
                        }), 'extension-error', xhr.status >= 400 && xhr.status < 500 ? 'sent' : 'received');
                    }
                );
            }
        );
    });

    // Change whether messages are limited to only the ones generated by the current user when the checkbox value changes.
    document.getElementById('show-only-me').addEventListener('change', function() {
        onlyMe = this.checked;
        chrome.storage.local.set({'acquia-logstream.onlyme': this.checked});
        sendRequestHeaderStatus();
    });

    // Set which log types to filter when the "Show log types" option changes.
    document.getElementById('logtypes').addEventListener('change', function(event) {
        var o = event.target.options;
        for (var i = 0, l = o.length; i < l; i++) {
            if (typeof logTypes[o[i].value] === 'object') {
                logTypes[o[i].value].enabled = o[i].selected;
            }
        }
        chrome.storage.local.set({'acquia-logstream.logtypes': JSON.stringify(logTypes)});
    });

    // Check to see if the current domain is associated with a cached sitename and environment, and if so, automatically pick them.
    chrome.storage.local.get({
            // Domains format is {DOMAIN: {sitename: SITENAME, environment: ENVNAME}}
            'acquia-logstream.domains': JSON.stringify({}),
        },
        function(items) {
            logIfError('Checking if the current website has a cached association with a sitename and environment failed with the error: %error');
            chrome.devtools.inspectedWindow.eval("window.location.hostname", function(hostname, error) {
                if (error || !hostname) {
                    showMessage(null, 'debug', t('Unable to get current hostname: %error', {error: error}), 'extension-error', 'here');
                }
                else {
                    var domains = JSON.parse(items['acquia-logstream.domains']);
                    for (var domain in domains) {
                        if (domains.hasOwnProperty(domain) && domain === hostname) {
                            domainMatchedSitename = domains[domain].sitename;
                            domainMatchedEnvironment = domains[domain].environment;
                            return;
                        }
                    }
                }
            });
        }
    );

    // Expand log message when clicked
    document.getElementById('content').addEventListener('click', function(event) {
        if (event.target.classList.contains('message')) {
            event.target.classList.remove('collapsed');
        }
    });

    // Update the credentials error, sitename list, and environment list when the Acquia Cloud credentials change.
    function onCredentialsChanged(items) {
        logIfError('Retrieving your saved settings failed with the error: %error');

        if (!items['acquia-logstream.username'] || !items['acquia-logstream.password']) {
            return document.getElementById('credentials-error').classList.remove('hidden');
        }
        document.getElementById('credentials-error').classList.add('hidden');

        resetSitenameList({}, items['acquia-logstream.sitename']);
    }
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        for (var key in changes) {
            if (namespace === 'local' && (key === 'acquia-logstream.username' || key === 'acquia-logstream.password')) {
                return chrome.storage.local.get({
                    'acquia-logstream.username': '',
                    'acquia-logstream.password': '',
                    'acquia-logstream.sitename': '',
                }, onCredentialsChanged);
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

/**
 * Sets up the WebSocket connection to stream logs from Acquia Cloud.
 *
 * WebSockets do not have cross-origin restrictions, which is why this function
 * can be called from within this content script.
 *
 * @param {Object} connectionInfo
 *   A map containing information required to connect via WebSocket to Acquia
 *   Cloud. This includes the `url` parameter (the WebSocket URL to which to
 *   connect) and the `msg` parameter (used to verify authentication). This
 *   map is obtained from the Acquia Cloud API.
 */
function setupWebSocket(connectionInfo) {
    var ws = new WebSocket(connectionInfo.url),
        logTypesElement = document.getElementById('logtypes');

    ws.onopen = function() {
        showMessage(null, 'debug', connectionInfo.msg, 'sent');
        showMessage(null, 'info', t('Connected successfully.'));
        ws.send(connectionInfo.msg);
    };

    ws.onmessage = function(event) {
        try {
            var data = JSON.parse(event.data);
            if (data.cmd === 'connected' || data.cmd === 'error' || data.cmd === 'success') {
                showMessage(null, 'debug', event.data, 'received');
            }
            else if (data.cmd === 'available') {
                showMessage(null, 'debug', event.data, 'received');
                if (typeof logTypes[data.type] === 'undefined') {
                    logTypes[data.type] = new LogType(data.display_type);
                    var op = document.createElement('option');
                    op.setAttribute('selected', '');
                    op.value = data.type;
                    op.textContent = data.display_type;
                    logTypesElement.appendChild(op);
                }
                if (logTypes[data.type].enabled) {
                    var msg = JSON.stringify({
                        cmd: 'enable',
                        type: data.type,
                        server: data.server,
                    });
                    showMessage(null, 'debug', msg, 'sent');
                    ws.send(msg);
                }
            }
            else if (data.cmd === 'line') {
                if (!(onlyMe instanceof RegExp) || onlyMe.test(data.text)) {
                    // At the time of writing, Cloud always streams UTC times,
                    // but does not make the timezone explicit in the disp_time string.
                    // showMessage() will assume local time if the timezone is not explicit,
                    // so we need to add a UTC timezone indicator.
                    data.disp_time += ' +0000';
                    if (typeof data.http_status === 'undefined') {
                        showMessage(data.disp_time, data.log_type, data.text, 'log');
                    }
                    else {
                        showMessage(data.disp_time, data.log_type, data.text, 'log', 'http-status-' +
                            (data.http_status < 400 ? 200 : 100 * Math.floor(data.http_status / 100))
                        );
                    }
                }
            }
        }
        catch(e) {
            showMessage(null, 'debug', t('Error receiving event: %error', {
                error: e+'',
            }), 'extension-error', 'here');
        }
    };

    ws.onclose = function() {
        showMessage(null, 'debug', t('Connection closed'), 'here');
        document.getElementById('connect').value = t('Reconnect');
    };

    ws.onerror = function() {
        showMessage(null, 'info', t('Connection error'), 'extension-error');
    };

    return ws;
}

}).call(this);
