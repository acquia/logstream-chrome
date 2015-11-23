This Chrome extension allows you to see what logs are being generated in real
time as you browse around a website that you maintain on
[Acquia Cloud](https://www.acquia.com/products-services/acquia-cloud). This
works by using the
[log streaming feature](https://docs.acquia.com/cloud/configure/logging/stream).

## Usage

First, your website needs to be running on Acquia Cloud. If you don't have a
website on Acquia Cloud but you want to try this extension anyway, you can
[sign up for free](https://insight.acquia.com/free).

Second, you need to install the extension. You can do this the usual way from the
[Chrome Web Store](https://chrome.google.com/webstore/category/extensions) or,
for development or testing purposes, you can load this extension's code in
[developer mode](https://developer.chrome.com/extensions/getstarted#unpacked).

Third, you need to input your login credentials to Acquia Cloud in the
extension's settings. Note that these will be stored unencrypted on your local
machine (as are all passwords that Chrome remembers on your behalf) so be sure
to remove them when you're done if you are uncomfortable with that.

Fourth, navigate to the website from which you want to stream logs. Open the
Chrome Developer Tools (press `Ctrl + Shift + J` or navigate to
`≡ » More tools » Developer tools`) and switch to the "Stream logs" panel.

Finally, select the sitename and environment for the site you are
investigating, then click the "Connect" button to start streaming logs. You can
browse around your website and watch as the logs are generated in real time.

## TODO

### Medium priority
- After saving AC API credentials, try a sample request to see if it succeeds or fails to determine if the credentials worked or not.
- Use ADL styles: https://wiki.acquia.com/display/UX/ADL+Style+guidelines
- Take screenshots/video, and embed in this README
- Add linting support
- Publish the extension and update the README to point to the extension on the Chrome Web Store

### Low priority
- Allow filtering streamed logs using regex. (Should this also filter logs that have already been rendered?) This seems to be safe (the main attack vector is a DoS which isn't a big deal since why would a user do that to themselves?) but needs error handling since regexes will often fail if executed while being written (or if written poorly).
- Change the order of the parameters to showMessage to s, type, datetime (to make type and datetime optional)
- Make logTypes for extension-error-debug and extension-error-info and undefined
- Clean up code (split up panels.js if possible, split up big functions, try to only load things after window.onload, see if the reset/render functions can be merged since they do basically the same things)
- Clean up the permissions in manifest.json
- Improve the select widgets for sitename and environment to be searchable to accomodate people with lots of sites. There don't seem to be any vanilla JS frameworks for this though.
- Change setting storage to remove "acquia-logstream." from the key names - it's not necessary because chrome.storage already uses extension namespaces.
- Clear my own chrome.storage for this extension so I don't leave old data sitting around.
