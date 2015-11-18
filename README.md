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

Now you need to run Chrome with CORS disabled so that your browser can make API
requests to Acquia Cloud from your own websites. Close Chrome if you already
have it open. (When you're done using this extension, restart Chrome normally
before using it for anything else in order to preserve your security.) To start
Chrome without CORS, run the appropriate command below in a terminal or command
prompt:

- On Linux: `google-chrome --disable-web-security`
- On Mac: usually `open -a Google\ Chrome --args --disable-web-security`
- On Windows: you need to directly reference the Chrome executable, which can
  be installed in different places. A common example is
  `"%USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe" --disable-web-security`.
  If you are not sure where the Chrome executable is, you can right-click on a
  shortcut to open Chrome, click on "Properties," and then copy the value in
  the "Target" field on the dialog that will appear.

Next, navigate to the website from which you want to stream logs. Open the
Chrome Developer Tools (press `Ctrl+Shift+J` or navigate to
`Hamburger > More tools > Developer tools`) and switch to the "Stream logs"
panel.

Finally, select the sitename and environment for the site you are
investigating, then click the "Connect" button to start streaming logs. You can
browse around your website and watch as the logs are generated in real time.

## TODO

### High priority
- It seems like cross-origin requests can be made in background.js. Try moving them there and see if we can get rid of the "start chrome in no-CORS mode" requirement. If that doesn't work, make it more clear what happened if CORS fails, and write a module for Drupal 7 and 8 that allows use of this extension without disabling CORS in Chrome. Update the extension code to use this if it's available and update the README to reflect this.
- Improve the way translations currently work to be compatible with https://developer.chrome.com/extensions/i18n
    use http://tumble.jeremyhubert.com/post/7076881720/translating-html-in-a-chrome-extension for HTML

### Medium priority
- After saving AC API credentials, try a sample request to see if it succeeds or fails to determine if the credentials worked or not.
- Use ADL styles: https://wiki.acquia.com/display/UX/ADL+Style+guidelines
- Allow filtering streamed logs using regex. (Should this also filter logs that have already been rendered?) This seems to be safe (the main attack vector is a DoS which isn't a big deal since why would a user do that to themselves?) but needs error handling since regexes will often fail if executed while being written (or if written poorly).
- Take screenshots/video, and embed in this README
- Add linting support
- Publish the extension and update the README to point to the extension on the Chrome Web Store

### Low priority
- Change the order of the parameters to showMessage to s, type, datetime (to make type and datetime optional) and make LOG_TYPE keys for extension-error-debug and extension-error-info and undefined in order to allow leaving off type and datetime more often
- Clean up code (split up panels.js if possible, split up big functions, try to only load things after window.onload, see if the reset/render functions can be merged since they do basically the same things)
- Clean up the permissions in manifest.json
- Improve the select widgets for sitename and environment to be searchable to accomodate people with lots of sites. There don't seem to be any vanilla JS frameworks for this though.
