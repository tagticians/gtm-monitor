# gtm-monitor
I created a Google Tag Manager monitor notification script that uses Simo's base GTM Monitor template with minor modifications and Firebase Functions and Real Time database. I am quite new at the whole cloud function, node server setup et al. stuff, but thought I would share this freely with you guys. See the attached files for the GTM template and Firebase Functions script.
## Purpose
This GTM Monitor script will only fire when GTM's addEventCallback function returns a tag with the status equal to 'failure'. It will forward the container ID, tag ID and tag name to Firebase's Real Time data base. The script will then monitor any activity on those tags. If it fails again within a set amount of time it will trigger a notification and pause any further notifications for 15 minutes. If the failures stop the database will be cleaned accordingly using a cron-job and a cleaning function on every call to the main monitoring function itself... probably overkill, but I like it clean :slightly_smiling_face:
A Firebase Blaze plan (needs credit card) is required to send requests outside of the Google domain, but unless you have some major issues with your GTM implementation you should stay within the free limits set by Firebase, including the cron-job limits.
Use of this script is FREE under the MIT license but I am in no way responsible for any costs made using this script on your Firebase account.
Credits go to Simo Ahava for the base Google Tag Manager template code.
## Prerequisites
1. IDE, for editing code
2. Node on local machine to install Firebase CLI
3. Firebase account with Real-Time database
4. Firebase CLI, to deploy functions to Firebase
5. Slack workspace
## Setup Instructions Steps
1. Create Firebase project through Firebase UI and create a Real-Time database
2. Use NPM to install Firebase CLI on your computer and login
3. Connect to your Firebase project through the Firebase CLI and create a local working folder
4. Start your favorite IDE and open the newly created Firebase working folder
5. Import gtm-monitor-firebase-function.js into your IDE's 'functions' folder
6. Edit script where necessary, ie. add your own Slack webhook URL on line #3
            You can get the webhook URL through Slack, using App Integrations > Webhooks and follow the instructions
7. Deploy to Firebase 'firebase deploy --only functions'
8. Copy URL for your gtmMonitor function
9. Import Tagticians Google Tag Monitor template into your Google Tag Manager container
10. Edit the template to change the permissions and paste in the function URL you just copied
11. Create a new tag in Google Tag Manager and use the Tagticians Google Tag Monitor template and add the function URL as the endpoint value
12. Test the tag in Google Tag Manager and verify tag data is coming into the real time database
13. Deploy and monitor
## Tips
a. Feel free to remove any of the console.log lines in the code. I used these for testing and quality control.
b. I think there are some promise issues in the script where nothing is returned which need to be fixed.
c. Replace Slack with anything you want, ie. Zapier to send your notifications to.
d. Please share any enhancements or code optimizations you make. I am more than happy to learn about how the function codes could possibly work better.
