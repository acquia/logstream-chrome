/**
 * Translates HTML in Chrome extensions.
 *
 * This works by replacing the content or attributes of a DOM element with a
 * translated string identified by the element's "data-i18n" attribute. For
 * example, `<p data-i18n="p_contents,title=p_title" title="hello">world</p>`
 * will be translated to `<p title="__MSG_p_title__">__MSG_p_contents__</p>`
 * (assuming `p_title` and `p_contents` are defined keys in a messages.json
 * file in the extension as described at
 * https://developer.chrome.com/extensions/i18n).
 *
 * Inspired by https://gist.github.com/eligrey/738199
 */
(function() {

window.addEventListener('load', function() {
    var needsTranslation = document.querySelectorAll("[data-i18n]"),
        t = chrome.i18n.getMessage;
    for (var i = 0, l = needsTranslation.length; i < l; i++) {
        var element = needsTranslation[i],
            targets = element.dataset.i18n.split(/\s*,\s*/);
        for (var j = 0, m = targets.length; j < m; j++) {
            var parameters = targets[j].split(/\s*=\s*/);
            if (parameters.length === 1 || parameters[0] === 'textContent') {
                element.textContent = t(element.dataset.i18n);
            }
            else if (parameters[0] === 'innerHTML') {
                element.innerHTML = t(element.dataset.i18n);
            }
            else {
                element.setAttribute(parameters[0], t(parameters[1]));
            }
        }
    }
});

}).call(this);
