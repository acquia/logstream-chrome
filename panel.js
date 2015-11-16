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


// Whether to show debug messages
var debug = false;

var showMessage = (function() {
    // TODO this works because we load the script after the container element.
    // Move it somewhere where that's not a risk.
    // But that requires moving basically the whole script inside onLoad.
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
     *   The type of message. Must match a key of `LOG_NAMES`.
     * @param {String} s
     *   The message to show.
     */
    return function showMessage(datetime, type, s) {
        if (!debug && type === 'debug') {
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
        messageDate.setTime(datetime ? Date.parse(datetime) : Date.now());
        dt.textContent = formatDate(messageDate);
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
        }), 'extension-error');
    }
}

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
            lastSelection = '',
            now = Date.now(),
            op;
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
        sitenameElement.value = lastSelection || (sites.length ? sitenameElement.options[0].value : lastSitename);
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
    function resetSitenameList(cloud, sitelist, items) {
        // Load from cache for speed.
        renderSitenameList(Object.keys(sitelist), null, items['acquia-logstream.sitename']);
        // Refresh from Cloud.
        showMessage(null, 'debug', t('Refreshing site list...'));
        cloud.request(
            'sites',
            function(sites) {
                if (!sites.length) {
                    return showMessage(null, 'info', t(
                        'You do not have access to any sites on Acquia Cloud. ' +
                        'To stream logs, create a site at https://insight.acquia.com/subscriptions/add ' +
                        'or ask an administrator for a site you work on to give you access.'
                    ), 'extension-error');
                }
                renderSitenameList(sites, sitelist, items['acquia-logstream.sitename']);
                showMessage(null, 'debug', t('Site list refreshed successfully.'));
                chrome.storage.local.set({'acquia-logstream.sitelist': JSON.stringify(sitelist)});
            },
            function(xhr) {
                document.getElementById('sitename').value = items['acquia-logstream.sitename'];
                document.getElementById('environment').value = items['acquia-logstream.environment'] || 'prod';
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
            lastSelection = '',
            now = Date.now(),
            op;
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
            if (site && typeof site === 'object') {
                if (typeof site[envName] === 'undefined') {
                    site[envName] = {domains: [], lastUpdated: now};
                }
                else {
                    site[envName].lastUpdated = now;
                }
            }
        }
        environmentElement.innerHTML = '';
        environmentElement.appendChild(envOptions);
        environmentElement.value = lastSelection || prod || dev || (envs.length ? environmentElement.options[0].value : lastEnvName);
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
    function resetEnvironmentList(cloud, sitename, sitelist, items) {
        // Load from cache for speed.
        renderEnvironmentList(Object.keys(sitelist[sitename]), null, items['acquia-logstream.environment']);
        // Refresh from Cloud.
        showMessage(null, 'debug', t('Refreshing environments list for site "%site"...', {site: sitename}));
        cloud.request(
            'sites/' + sitename + '/envs',
            function(envs) {
                if (!envs.length) {
                    return showMessage(null, 'info', t(
                        'The site "%site" does not have any environments yet.',
                        { site: sitename }
                    ), 'extension-error');
                }
                renderEnvironmentList(
                    envs.map(function(env) {
                        return env.name;
                    }),
                    sitelist[sitename],
                    items['acquia-logstream.environment']
                );
                chrome.storage.local.set({'acquia-logstream.sitelist': JSON.stringify(sitelist)});
                showMessage(null, 'debug', t('Environment list refreshed successfully.'));
            },
            function(xhr) {
                document.getElementById('environment').value = items['acquia-logstream.environment'] || 'prod';
                showMessage(null, 'debug', t(
                    'Retrieving environments for site "%site" failed.',
                    { site: sitename }
                ), 'extension-error');
            }
        );
    }

    chrome.storage.local.get({
            'acquia-logstream.username': '',
            'acquia-logstream.password': '',
            'acquia-logstream.sitename': '',
            'acquia-logstream.environment': '',
            'acquia-logstream.debug': debug,
            // {SITENAME: {ENVIRONMENT: {domains: ['hostname.com'], lastUpdated: lastUpdatedTimestamp}, lastUpdated: lastUpdatedTimestamp}}
            'acquia-logstream.sitelist': JSON.stringify({}),
        },
        function(items) {
            logIfError('Retrieving your saved settings failed with the error: %error');

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
                sitelist = JSON.parse(items['acquia-logstream.sitelist']),
                lastSite;

            // Update the environment list when the site changes.
            sitenameElement.addEventListener('change', function() {
                var sitename = sitenameElement.value;
                if (sitename === lastSite || !sitename) {
                    return;
                }
                lastSite = sitename;
                resetEnvironmentList(cloud, sitename, sitelist, items);
            });

            // Update the sitename list.
            resetSitenameList(cloud, sitelist, items);

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
        // cloud.request('sites/$SITENAME/envs/$ENV/domains') // returns a JSON array of objects where the "name" property contains a hostname
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

    // Check to see if the current domain is associated with a cached sitename and environment, and if so, automatically pick them.
    // Wrapped in setTimeout() so it is non-blocking.
    // TODO: extract domains from the sitelist object and store them separately as {DOMAIN: {sitename: SITENAME, environment: ENVNAME}}
    setTimeout(function() {
        chrome.storage.local.get({
                'acquia-logstream.sitelist': JSON.stringify({}),
            },
            function(items) {
                logIfError('Checking if the current page has a cached association with a sitename and environment failed with the error: %error');
                var sitelist = JSON.parse(items['acquia-logstream.sitelist']);
                chrome.devtools.inspectedWindow.eval("window.location.hostname", function(domain, error) {
                    if (error || !domain) {
                        showMessage(null, 'debug', t('Unable to get current hostname: %error', {error: error}), 'extension-error');
                    }
                    else {
                        for (var site in sitelist) {
                            if (sitelist.hasOwnProperty(site) && typeof sitelist[site] === 'object') {
                                for (var env in sitelist[site]) {
                                    if (sitelist[site].hasOwnProperty(env)
                                            && typeof sitelist[site][env] === 'object'
                                            && sitelist[site][env].domains.indexOf(domain) !== -1) {
                                        sitenameElement.value = site;
                                        environmentElement.value = env;
                                        return;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        );
    }, 0);

    // Expand log message when clicked
    document.getElementById('content').addEventListener('click', function(event) {
        if (event.target.classList.contains('message')) {
            event.target.classList.remove('collapsed');
        }
    });

    // Update the credentials error, sitename list, and environment list when the Acquia Cloud credentials change.
    function onCredentialsChanged(items) {
        logIfError('Retrieving your saved settings failed with the error: %error');

        var user = items['acquia-logstream.username'],
            pass = items['acquia-logstream.password'],
            cloud = new CloudAPI(user, pass);
        if (!user || !pass) {
            return document.getElementById('credentials-error').classList.remove('hidden');
        }
        document.getElementById('credentials-error').classList.add('hidden');

        resetSitenameList(cloud, {}, items);
    }
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        for (var key in changes) {
            if (namespace === 'local' && (key === 'acquia-logstream.username' || key === 'acquia-logstream.password')) {
                return chrome.storage.local.get({
                    'acquia-logstream.username': '',
                    'acquia-logstream.password': '',
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

function setupWebSocket(connectionInfo) {
    var ws = new WebSocket(connectionInfo.url);

    ws.onopen = function() {
        showMessage(null, 'debug', connectionInfo.msg, 'sent');
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
                showMessage(null, 'debug', event.data, 'received');
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
                    showMessage(null, 'debug', msg, 'sent');
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
        showMessage(null, 'debug', t('Connection closed'));
        document.getElementById('connect').value = t('Reconnect');
    };

    ws.onerror = function() {
        showMessage(null, 'info', t('Connection error'), 'extension-error');
    };

    return ws;
}

}).call(this);
