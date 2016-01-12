/*
 * Streams logs.
 *
 * By Isaac Sukin (IceCreamYou).
 */

/**
 * Tear down.
 */
window.addEventListener('unload', function() {
    // Stop sending the X-REQUEST-ID header since we're done using it.
    chrome.runtime.sendMessage('disableRequestHeaders');
});

/**
 * Set up.
 */
window.addEventListener('load', function() {
// The rest of this file is inside this function, so it is intentionally
// un-indented for readability.

'use strict';

// Don't allow submitting the form.
document.getElementById('controls').addEventListener('submit', function(event) {
    event.preventDefault();
});

// Shortcut for translation.
var t = chrome.i18n.getMessage;

// Whether to show only logs the current user generates.
// If truthy, may hold a regex which identifies requests the user generated.
var onlyMe = true;

// Whether or not the user is an Acquia employee
var acquiaUser = false;

// If we can detect that the current hostname matched a Cloud site, these will
// contain the sitename and environment of that site.
var domainMatchedSitename = '',
    domainMatchedEnvironment = '';

// Used to filter incoming log messages.
var regexFilter = '';

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
 *   - `{String} name`: The human-friendly, translated name of the log type.
 */
function LogType(options) {
    this.name = typeof options === 'string' ? options : options.name;
    this.allowToggling = typeof options.allowToggling === 'undefined' ? true : options.allowToggling;
    this.enabled = typeof options.enabled === 'undefined' ? true : options.enabled;
}

// Holds information about the available log types. These defaults are the ones
// that we expect to be available. The list will be updated based on what the
// servers advertise. The keys are semantically meaningful because they match
// keys sent from the servers and are used in CSS classes.
var logTypes = {
    'apache-error':    new LogType(t('logType_apacheError')),
    'apache-request':  new LogType(t('logType_apacheRequest')),
    'bal-request':     new LogType(t('logType_balancerRequest')),
    'drupal-request':  new LogType(t('logType_drupalRequest')),
    'drupal-watchdog': new LogType(t('logType_drupalWatchdog')),
    'mysql-slow':      new LogType(t('logType_mysqlSlow')),
    'php-error':       new LogType(t('logType_phpError')),
    'varnish-request': new LogType(t('logType_varnishRequest')),
    'debug':           new LogType({
        enabled: false,
        name: t('logType_debug'),
    }),
    'info':            new LogType({
        allowToggling: false,
        name: t('logType_info'),
    }),
};

var showMessage = (function() {
    // This works because we load the script after the container element.
    var container = document.getElementById('content'),
        queuedLogs = document.createDocumentFragment(),
        messageDate = new Date(),
        elemCount = 0,
        ELEMCOUNT_MAX = 1000,
        formatDate = new Intl.DateTimeFormat(new Intl.DateTimeFormat().resolvedOptions().locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short',
        }).format;

    chrome.storage.sync.get({ 'elemcount_max': ELEMCOUNT_MAX }, function(items) {
        // Use the setting for the max unless there was an error retrieving it.
        if (typeof chrome.runtime.lastError !== 'string') {
            ELEMCOUNT_MAX = items.elemcount_max;
        }
    });

    requestAnimationFrame(function writeLogs() {
        if (queuedLogs.children.length) {
            // Inserting a DocumentFragment removes its children.
            // http://dom.spec.whatwg.org/#concept-node-insert
            container.insertBefore(queuedLogs, container.firstChild);

            // Remove elements at the end of the stream if there are too many.
            while (elemCount > ELEMCOUNT_MAX) {
                container.removeChild(container.lastChild);
                elemCount--;
            }
        }
        requestAnimationFrame(writeLogs);
    });

    /**
     * Logs a message to the logstream devtools panel.
     *
     * For performance reasons, the message is not appended to the document
     * during this function's execution; instead, it is queued to be added
     * the next time a frame is being painted.
     *
     * @param {String} message
     *   The message to show.
     * @param {String} [type='info']
     *   The type of message. Must match a key of `logTypes`.
     * @param {String} [datetime=new Date().toISOString()]
     *   The time at which the message was generated as an ISO-8601 string or
     *   some other string that can be parsed by `Date.parse()`. If falsy, this
     *   is generated as the current time.
     * @param {String} [...]
     *   Additional parameters are added as classes to the log's DOM element.
     */
    return function showMessage(message, type, datetime) {
        type = type ? type+'' : 'info';
        if (!logTypes[type].enabled) {
            return;
        }
        var el = document.createElement('div'), // wrapper element
            dt = document.createElement('span'), // datetime
            ty = document.createElement('span'), // type of log
            tx = document.createElement('span'), // text of log message
            args = Array.prototype.slice.call(arguments, 3);
        args.push('message', 'collapsed', type);
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
        ty.textContent = logTypes[type].name;
        tx.textContent = message;
        el.appendChild(dt);
        el.appendChild(ty);
        el.innerHTML += tx.textContent;
        queuedLogs.insertBefore(el, queuedLogs.firstChild);
        elemCount++;
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
        showMessage(t(message, chrome.runtime.lastError), 'debug', null, 'extension-error', 'here');
        return true;
    }
}

function getCloudInfo(path, success, failure) {
    chrome.storage.local.get({ username: '', password: '' }, function(items) {
        logIfError('errors_getCredentialsFailed');

        chrome.runtime.sendMessage({
                method: 'getCloudInfo',
                user: items.username,
                pass: items.password,
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
    });
}

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
        ws.send(connectionInfo.msg);
    };

    ws.onmessage = function(event) {
        try {
            var data = JSON.parse(event.data);
            if (data.cmd === 'connected') {
                // Streaming connection opened.
                if (data.server.indexOf('logstream-') === 0) {
                    showMessage(t('info_connected'));
                }
                // Streaming from a specific server is enabled.
                else {
                    showMessage(t('info_connectedToServer', data.server), 'debug', null, 'received');
                }
            }
            else if (data.cmd === 'error') {
                showMessage(t('errors_serverSideTrouble', event.data), 'debug', null, 'received', 'extension-error');
            }
            else if (data.cmd === 'success') {
                // A keep-alive message succeeded.
                if (data.msg.cmd === 'keepalive') {
                    showMessage(t('info_keepalive'), 'debug', null, 'received');
                }
                // A log type was successfully enabled.
                else if (data.msg.cmd === 'enable') {
                    showMessage(t('info_logTypeEnabled', [
                        logTypes[data.msg.type].name, data.server,
                    ]), 'debug', null, 'received');
                }
                else {
                    showMessage(event.data, 'debug', null, 'received');
                }
            }
            else if (data.cmd === 'available') {
                showMessage(t('info_logTypeAvailable', [
                    data.display_type, data.server,
                ]), 'debug', null, 'received');
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
                    showMessage(t('info_requestEnableLogType', [
                        data.display_type, data.server,
                    ]), 'debug', null, 'sent');
                    ws.send(msg);
                }
            }
            else if (data.cmd === 'line') {
                if ((!(onlyMe      instanceof RegExp) ||      onlyMe.test(data.text)) &&
                    (!(regexFilter instanceof RegExp) || regexFilter.test(data.text))) {
                    // At the time of writing, Cloud always streams UTC times,
                    // but does not make the timezone explicit in the disp_time string.
                    // showMessage() will assume local time if the timezone is not explicit,
                    // so we need to add a UTC timezone indicator.
                    data.disp_time += ' +0000';
                    if (typeof data.http_status === 'undefined') {
                        showMessage(data.text, data.log_type, data.disp_time, 'log');
                    }
                    else {
                        showMessage(data.text, data.log_type, data.disp_time, 'log', 'http-status-' +
                            (data.http_status < 400 ? 200 : 100 * Math.floor(data.http_status / 100))
                        );
                    }
                }
            }
            else {
                showMessage(event.data, 'debug', null, 'received');
            }
        }
        catch(e) {
            showMessage(t('errors_logEventHandlingFailed', e.stack), 'debug', null, 'extension-error', 'here');
        }
    };

    ws.onclose = function() {
        showMessage(t('info_connectionClosed'), 'debug', null, 'here');
        document.getElementById('connect').value = t('panel_reconnect');
    };

    ws.onerror = function() {
        showMessage(t('errors_wsError'), 'info', null, 'extension-error');
    };

    return ws;
}

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
    if (acquiaUser) {
        op = document.createElement('option');
        op.value = 'other';
        op.textContent = 'other';
        siteOptions.appendChild(op);
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
    showMessage(t('info_refreshSitesStart'), 'debug', null, 'sent');
    getCloudInfo(
        'sites',
        function(sites) {
            if (!sites.length) {
                return showMessage(t('errors_noSites'), 'info', null, 'extension-error');
            }
            renderSitenameList(sites, sitelist, lastSitename);
            showMessage(t('info_refreshSitesSuccess'), 'debug', null, 'received');
            chrome.storage.local.set({ sitelist: JSON.stringify(sitelist) });
        },
        function(xhr) {
            showMessage(t('errors_refreshSitesFailed', [
                xhr.statusText, xhr.responseText,
            ]), 'debug', null, 'extension-error', xhr.status >= 400 && xhr.status < 500 ? 'sent' : 'received');
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
    if (typeof sitelist[sitename] !== 'undefined') {
        renderEnvironmentList(Object.keys(sitelist[sitename]), null, lastEnvName);
    }
    // Refresh from Cloud.
    showMessage(t('info_refreshEnvironmentsStart', sitename), 'debug', null, 'sent');
    getCloudInfo(
        'sites/' + sitename + '/envs',
        function(envs) {
            if (!envs.length) {
                return showMessage(t('errors_noEnvironments', sitename), 'info', null, 'extension-error');
            }
            renderEnvironmentList(envs.map(function(env) {
                return env.name;
            }), sitelist[sitename], lastEnvName);
            chrome.storage.local.set({ sitelist: JSON.stringify(sitelist) });
            showMessage(t('info_refreshEnvironmentsSuccess'), 'debug', null, 'received');
        },
        function(xhr) {
            showMessage(t('errors_refreshEnvironmentsFailed', [
                sitename, xhr.statusText, xhr.responseText,
            ]), 'debug', null, 'extension-error', xhr.status >= 400 && xhr.status < 500 ? 'sent' : 'received');
        }
    );
}

function sendRequestHeaderStatus() {
    if (onlyMe) {
        chrome.runtime.sendMessage('enableRequestHeaders', function(uuid) {
            onlyMe = new RegExp('request_id="ac-ls-ce-' + uuid + '-[0-9a-f-]{36}');
        });
    }
    else {
        chrome.runtime.sendMessage('disableRequestHeaders');
    }
}

// Save the most recent sitename and update the environment list.
document.getElementById('sitename').addEventListener('change', (function() {
    var sitenameElement = document.getElementById('sitename'),
        environmentElement = document.getElementById('environment'),
        lastSite;

    function onGetSitelist(items) {
        logIfError('errors_getSettings');
        resetEnvironmentList(sitenameElement.value, JSON.parse(items.sitelist), items.environment);
    }

    return function() {
        var sitename = sitenameElement.value;
        chrome.storage.local.set({ sitename: sitename });

        if (sitename === 'other') {
            lastSite = 'other';
            // show the custom text box for entering a sitename manually.
            document.getElementById('customSitename').classList.remove('hidden');
        }
        else {
            document.getElementById('customSitename').classList.add('hidden');
        }

        if ((sitename !== lastSite && sitename) || !environmentElement.length) {
            lastSite = sitename;
            chrome.storage.local.get({
                environment: '',
                sitelist: JSON.stringify({}),
            }, onGetSitelist);
        }
    };
})());

// Save the most recent sitename and update the environment list.
document.getElementById('custom_sitename').addEventListener('change', (function() {
    var sitenameElement = document.getElementById('custom_sitename'),
        environmentElement = document.getElementById('environment'),
        lastSite;

    function onGetSitelist(items) {
        logIfError('errors_getSettings');
        resetEnvironmentList(sitenameElement.value, JSON.parse(items.sitelist), items.environment);
    }

    return function() {
        var sitename = sitenameElement.value;
        chrome.storage.local.set({ sitename: sitename });

        if ((sitename !== lastSite && sitename) || !environmentElement.length) {
            lastSite = sitename;
            chrome.storage.local.get({
                environment: '',
                sitelist: JSON.stringify({}),
            }, onGetSitelist);
        }
    };
})());

// Save the most recent environment.
document.getElementById('environment').addEventListener('change', (function() {
    var sitenameElement = document.getElementById('sitename'),
        environmentElement = document.getElementById('environment');

    function onGetDomainsFailure(xhr) {
        showMessage(t('errors_getDomainsFailed', [
            xhr.statusText, xhr.responseText,
        ]), 'debug', null, 'extension-error', xhr.status >= 400 && xhr.status < 500 ? 'sent' : 'received');
    }

    function onGetDomains(items) {
        if (logIfError('errors_getCachedDomainsFailed')) {
            return;
        }
        var domains = JSON.parse(items.domains),
            sitename = sitenameElement.value,
            envName = environmentElement.value;
        getCloudInfo(
            'sites/' + sitename + '/envs/' + envName + '/domains',
            function(results) {
                for (var i = 0, l = results.length; i < l; i++) {
                    domains[results[i].name] = {
                        sitename: sitename,
                        environment: envName,
                    };
                }
                chrome.storage.local.set({ domains: JSON.stringify(domains) });
            },
            onGetDomainsFailure
        );
    }

    return function() {
        if (sitenameElement.value && environmentElement.value) {
            chrome.storage.local.set({ environment: environmentElement.value });
            // Cache the list of domains for this environment.
            // Domains format is {DOMAIN: {sitename: SITENAME, environment: ENVNAME}}
            chrome.storage.local.get({ domains: JSON.stringify({}) }, onGetDomains);
        }
    };
})());

chrome.storage.local.get({
        username: '',
        password: '',
        sitename: '',
        onlyme: onlyMe,
        logtypes: JSON.stringify(logTypes),
        // Sitelist format is {SITENAME: {ENVIRONMENT: {lastUpdated: TIMESTAMP}, lastUpdated: TIMESTAMP}}
        sitelist: JSON.stringify({}),
    },
    function(items) {
        logIfError('errors_getSettings');

        if (!items.username || !items.password) {
            document.getElementById('export-wrapper').classList.add('hidden');
            document.getElementById('credentials-error').classList.remove('hidden');
        }

        var acquiaRegex = new RegExp("@acquia\.com$", 'm');
        if (acquiaRegex.test(items.username)) {
            acquiaUser = true;
        }

        onlyMe = items.onlyme;
        document.getElementById('show-only-me').checked = !!onlyMe;
        sendRequestHeaderStatus();

        logTypes = JSON.parse(items.logtypes);
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

        // Update the sitename list.
        resetSitenameList(JSON.parse(items.sitelist), items.sitename);
    }
);

// (Dis)connect when the button is clicked.
document.getElementById('connect').addEventListener('click', (function() {
    var connectButton = document.getElementById('connect'),
        sitenameElement = document.getElementById('sitename'),
        customSitenameElement = document.getElementById('custom_sitename'),
        environmentElement = document.getElementById('environment'),
        ws;

    function onGetLogStreamConnectionInfoSuccess(connectionInfo) {
        ws = setupWebSocket(connectionInfo);
        connectButton.value = t('panel_disconnect');
    }

    function onGetLogStreamConnectionInfoFailure(xhr) {
        showMessage(t('errors_getLogStreamConnectionInfoFailed', [
            xhr.statusText, xhr.responseText
        ]), 'info', null, 'extension-error');
        try {
            ws.close();
        }
        catch(e) {}
    }

    return function(event) {
        event.preventDefault();
        if (typeof ws === 'undefined' || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
            var site       = sitenameElement.value,
                customSite = customSitenameElement.value,
                env        = environmentElement.value;

            if (site === 'other') {
                site = customSite;
            }
            if (!site) {
                return showMessage(t('errors_invalidSitename'), 'info', null, 'extension-error');
            }
            if (!env) {
                return showMessage(t('errors_invalidEnvironment'), 'info', null, 'extension-error');
            }

            showMessage(t('info_connecting'));
            getCloudInfo(
                'sites/' + site + '/envs/' + env + '/logstream',
                onGetLogStreamConnectionInfoSuccess,
                onGetLogStreamConnectionInfoFailure
            );
        }
        else { // ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING
            ws.close();
            connectButton.value = t('panel_reconnect');
        }
    };
})());

// Update the regex filter.
var lastRegexValue = '';
document.getElementById('regex').addEventListener('keyup', function() {
    var thisValue = this.value;
    if (thisValue === lastRegexValue) {
        return;
    }
    lastRegexValue = thisValue;
    try {
        regexFilter = thisValue ? new RegExp(thisValue, 'm') : '';
    }
    catch(e) {
        showMessage(t('errors_regexDidNotCompile', [
            thisValue, e.name, e.message,
        ]), 'info', null, 'extension-error');
    }
});

// Change whether messages are limited to only the ones generated by the current user when the checkbox value changes.
document.getElementById('show-only-me').addEventListener('change', function() {
    onlyMe = this.checked;
    chrome.storage.local.set({ onlyme: this.checked });
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
    chrome.storage.local.set({ logtypes: JSON.stringify(logTypes) });
});

// Check to see if the current domain is associated with a cached sitename and environment, and if so, automatically pick them.
// Domains format is {DOMAIN: {sitename: SITENAME, environment: ENVNAME}}
chrome.storage.local.get({ domains: JSON.stringify({}) }, function(items) {
    logIfError('errors_getCachedDomainsFailed');
    chrome.devtools.inspectedWindow.eval('window.location.hostname', function(hostname, error) {
        if (error || !hostname) {
            showMessage(t('errors_getHostname', error), 'debug', null, 'extension-error', 'here');
        }
        else {
            var domains = JSON.parse(items.domains);
            for (var domain in domains) {
                if (domains.hasOwnProperty(domain) && domain === hostname) {
                    domainMatchedSitename = domains[domain].sitename;
                    domainMatchedEnvironment = domains[domain].environment;
                    return;
                }
            }
        }
    });
});

// Expand log message when clicked
document.getElementById('content').addEventListener('click', function(event) {
    if (event.target.classList.contains('message')) {
        event.target.classList.remove('collapsed');
    }
});

// Update the credentials error, sitename list, and environment list when the Acquia Cloud credentials change.
chrome.storage.onChanged.addListener((function() {
    function onCredentialsChanged(items) {
        logIfError('errors_getCredentialsFailed');

        if (!items.username || !items.password) {
            document.getElementById('export-wrapper').classList.add('hidden');
            return document.getElementById('credentials-error').classList.remove('hidden');
        }
        document.getElementById('export-wrapper').classList.remove('hidden');
        document.getElementById('credentials-error').classList.add('hidden');

        resetSitenameList({}, items.sitename);
    }

    return function(changes, namespace) {
        for (var key in changes) {
            if (namespace === 'local' && (key === 'username' || key === 'password')) {
                return chrome.storage.local.get({
                    username: '',
                    password: '',
                    sitename: '',
                }, onCredentialsChanged);
            }
        }
    };
})());

// Export logs.
document.getElementById('export').addEventListener('click', function () {
    var sitename = document.getElementById('sitename').value.replace(/\W+/g, '-'),
        environment = document.getElementById('environment').value.replace(/\W+/g, '-'),
        datetime = new Date().toISOString().replace(/:|T/g, '-').replace(/\.\d+Z$/, ''),
        contents = '',
        messages = document.querySelectorAll('#content .message');

    for (var i = 0, l = messages.length; i < l; i++) {
        for (var j = 0, n = messages[i].childNodes, l2 = n.length; j < l2; j++) {
            contents += n[j].textContent + '\t';
        }
        contents += '\n';
    }

    this.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(contents));
    this.setAttribute('download', 'logs-' + sitename + '-' + environment + '-' + datetime + '.txt');
    showMessage(t('info_exported', messages.length + ''), 'debug', null, 'here');
});

// Open the settings when a settings link is clicked.
document.getElementById('controls').addEventListener('click', function(event) {
    if (event.target.classList.contains('options-link')) {
        event.preventDefault();
        chrome.runtime.sendMessage('openOptionsPage');
    }
});

});
