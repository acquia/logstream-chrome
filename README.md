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
machine, so be sure to remove them when you're done if you are uncomfortable
with that.

Now you need to run Chrome with CORS disabled so that your browser can make API
requests to Acquia Cloud from your own websites. Close Chrome if you already
have it open, and restart Chrome when you're done before using it for anything
else in order to preserve your security. To start Chrome without CORS, run the
appropriate command below in a terminal or command prompt.

- On Linux: `google-chrome --disable-web-security`
- On Mac: `open -a Google\ Chrome --args --disable-web-security`
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

Finally, you need to fill in the sitename and environment for the site you are
investigating. These values will persist so that you don't have to find them
every time you use the tool.

Click the "Connect" button to start streaming logs. You can browse around your
website and watch as the logs are generated in real time.

## TODO

- Add an option to only show logs caused by requests the current browser made (on pages that can stream logs) using X-Request-ID
    Make background.js send X-Request-ID correctly
    Filter to logs with request_id="<id>" for IDs that we sent
- Keep a default set of log types to populate the "Show log types" form element initially
- Sort sitenames and environments alphabetically, with dev/stage/prod at the top
- Segment the sitename selector by stage
- See if the way we make API calls can be modified to not leak the user's Cloud creds in the URL
- Improve the way translations currently work to be compatible with https://developer.chrome.com/extensions/i18n
- Change the order of the parameters to showMessage to s, type, datetime (to make type and datetime optional) and make LOG_TYPE keys for extension-error-debug and extension-error-info and undefined in order to allow leaving off type and datetime more often
- After saving AC API credentials, try a sample request to see if it succeeds or fails to determine if the credentials worked or not.
- Clean up code (split up panels.js if possible, split up big functions, try to only load things after window.onload, see if the reset/render functions can be merged since they do basically the same things)
- Clean up the permissions in manifest.json
- Improve the select widgets for sitename and environment to be searchable to accomodate people with lots of sites
- Take screenshots/video, and embed in this README
- Add linting support
- Write a module for Drupal 7 and 8 that allows use of this extension without disabling CORS in Chrome. Update the extension code to use this if it's available and update the README to reflect this.
- Publish the extension
