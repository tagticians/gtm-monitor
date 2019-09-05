// Set base variables
const slackWebHookUrl =
  'https://hooks.slack.com/services/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'; // Slack webhook URL
const baseCheckTagNumber = 3; // Send notification alert after this many failures for a single tag
const baseCheckTimeActive = 5; // Number of tag failures as define above must happen within this many minutes
const baseCheckTimePaused = 15; // When notification is sent, how many minutes must the notifications be paused
const updateLoopTimeLimit = 5000; // Loop time limit difference to prevent infinite looping in onUpdate function

// Slack notification function, change if you want another notification destination (ie. Zapier) and/or message
function sendNotification(tagId, tagName) {
  request.post(slackWebHookUrl, {
    json: {
      text: `Tag "${tagName}" (id: ${tagId}) failed to load correctly.\nAlerting paused for ${baseCheckTimePaused} minutes.`
    }
  });
}

// DO NOT CHANGE ANYTHING BELOW THIS LINE

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const request = require('request');
admin.initializeApp();

// Helper Functions
function millisecondsToMinutes(ms) {
  let seconds = ms / 1000;
  let minutes = seconds / 60;
  return Math.floor(minutes);
}

// General Function To Clean Old Timestamps
function cleanTimestamps(tagId, latestTimestamp, baseCheckTimeActive) {
  console.log(`Starting Timestamp Clean-up helper function.`);
  admin
    .database()
    .ref(tagId)
    .child('timestamps')
    .once('value', snapshot => {
      snapshot.forEach(data => {
        if (
          millisecondsToMinutes(latestTimestamp - data.val()) >
          baseCheckTimeActive
        ) {
          admin
            .database()
            .ref(tagId)
            .child('timestamps')
            .child(data.key)
            .remove();
          console.log(
            `Removed: ${data.val()}. Difference was ${millisecondsToMinutes(
              latestTimestamp - data.val()
            )} minutes.`
          );
        } else {
          console.log(
            `Kept: ${data.val()}. Difference was ${millisecondsToMinutes(
              latestTimestamp - data.val()
            )} minutes.`
          );
        }
      });
    });
}

// GTM Monitor Function
exports.gtmMonitor = functions.https.onRequest((req, res) => {
  // Return when no 'tag' is included in request
  if (!req.query.tag1id) {
    res.status(200);
    res.send('No Tag ID present.');
  } else {
    const queryItems = Object.entries(req.query);
    // Rebuild Array Query into multilevel JSON per Tag
    let tagJson = {};

    for (const [queryKey, queryValue] of queryItems) {
      if (queryKey.startsWith('event')) {
        tagJson[queryKey] = queryValue;
      } else if (queryKey.startsWith('tag')) {
        let tagId = queryKey.match(/(tag[0-9])+/i)[0];
        if (tagJson[tagId] === undefined) {
          tagJson[tagId] = {};
        }

        let tagType = queryKey.match(/tag[0-9]+(.*)/i)[1];
        tagJson[tagId][tagType] = queryValue;
      }
    }

    // Prepare data for saving to Firebase
    let numberOfTags = Object.keys(tagJson).length - 2;
    for (i = 1; i <= numberOfTags; i++) {
      let tagSet = 'tag' + i;
      let tagId = tagJson[tagSet].id;
      let timestamp = tagJson.eventTimestamp;

      let pushTimestamp = function() {
        admin
          .database()
          .ref(tagId)
          .child('timestamps')
          .push(timestamp);
      };

      admin
        .database()
        .ref(tagId)
        .once('value', snapshot => {
          if (snapshot.exists()) {
            // Send timestamp to Firebase
            admin
              .database()
              .ref(tagId)
              .update({
                latestTimestamp: timestamp
              });
            pushTimestamp();
          } else {
            // Send full data object to Firebase
            admin
              .database()
              .ref(tagId)
              .set({
                name: tagJson[tagSet].nm,
                status: 'active',
                latestTimestamp: timestamp,
                systemTimestamp: Date.now(),
                container: tagJson['eventContainer']
              });
            pushTimestamp();
          }
        });
    }
    res.status(200);
    res.send('Tag Call Saved');
  }
});

// GTM Timestamp Check Function
exports.checkTagTimestamps = functions.database
  .ref('/{tagId}/timestamps')
  .onUpdate((timestampSnap, context) => {
    // Load entire tag set
    const tagId = context.params.tagId;
    const db = admin.database();
    const ref = db.ref(tagId);
    ref
      .once('value', snapshot => {
        return snapshot;
      })
      .then(tagSnapshot => {
        const tagValue = tagSnapshot.val();

        // Extract data from timestamp snapshot
        const after = timestampSnap.after.val();
        const numberOfTimestamps = timestampSnap.after.numChildren();

        // Create array of timestamps and sort by timestamp
        let timestampArray = [];
        for (let key in after) {
          timestampArray.push(after[key]);
        }
        timestampArray = timestampArray.sort();
        console.log(timestampArray);

        // Calculate timestamp differences
        const latestTimestamp = timestampArray[timestampArray.length - 1];
        const previousTimestamp = timestampArray[timestampArray.length - 2];
        console.log(
          `timestampDifference: ${latestTimestamp} - ${previousTimestamp} = ${latestTimestamp -
            previousTimestamp}`
        );

        // Try to prevent update loop, and update systemTimestamp
        const pausedTime = tagValue.pausedTime || latestTimestamp;
        const systemTimestamp = tagValue.systemTimestamp;
        const currentTimestamp = Date.now();
        const updateLoopTimeDifference = currentTimestamp - systemTimestamp;

        if (updateLoopTimeDifference < updateLoopTimeLimit) {
          console.log(
            `Preventing loop. Time difference is: ${updateLoopTimeDifference}`
          );
          return true;
        } else {
          console.log(
            `Updating systemTime. Time difference is: ${updateLoopTimeDifference}`
          );
          admin
            .database()
            .ref(tagId)
            .update({ systemTimestamp: Date.now() });
        }

        // Check if monitor has minimum number of timestamps
        if (numberOfTimestamps >= baseCheckTagNumber) {
          console.log(
            `There are enough timestamps. Current number of timestamps: ${numberOfTimestamps}`
          );

          // Reset tag status to 'active' if difference is greater than or equal to 15 minutes
          let tagStatus = tagValue.status;
          if (tagStatus === 'paused') {
            const pauseTimeDifferenceSum = latestTimestamp - pausedTime;
            const pauseTimeDifference = millisecondsToMinutes(
              pauseTimeDifferenceSum
            );
            if (pauseTimeDifference >= baseCheckTimePaused) {
              admin
                .database()
                .ref(tagId)
                .child('status')
                .set('active');
              admin
                .database()
                .ref(tagId)
                .child('pausedTime')
                .remove();
              tagStatus = 'active';
              console.log(`Changing tagStatus to ${tagStatus}`);
            } else {
              console.log(`No loop performed. tagStatus is ${tagStatus}`);
            }
            console.log(
              `Starting removal of timestamps older than ${baseCheckTimeActive} minutes.`
            );
            cleanTimestamps(tagId, latestTimestamp, baseCheckTimeActive);
            return true;
          } else {
            console.log(`tagStatus is ${tagStatus}`);
          }

          if (tagStatus === 'active') {
            console.log('Starting Loop');

            // Calculate difference between lowest timestamp and latest timestamp
            const maxTimestamp = timestampArray[timestampArray.length - 1];
            const minTimestamp = timestampArray[0];
            const timestampDifferenceSum = maxTimestamp - minTimestamp;
            console.log(
              `${maxTimestamp} - ${minTimestamp} = ${timestampDifferenceSum}`
            );
            console.log(
              `minMaxTimestampDifferenceSum: ${timestampDifferenceSum}`
            );
            const timestampDifference = millisecondsToMinutes(
              timestampDifferenceSum
            );
            console.log(`minMaxTimestampDifference: ${timestampDifference}`);

            // Send alert and store failed tag in Database and set tag status to paused
            if (
              timestampDifference <= baseCheckTimeActive &&
              tagStatus === 'active'
            ) {
              console.log(
                `Triggering Alert. Difference is ${timestampDifference}`
              );
              admin
                .database()
                .ref(tagId)
                .update({ pausedTime: currentTimestamp, status: 'paused' });
              sendNotification(tagId, tagValue.name);
              console.log(`Database updated.\nSlack notification sent.`);
            }

            // Loop through timestamps and remove timestamps with a difference greater than 5 minutes
            console.log(
              `Starting removal of timestamps older than ${baseCheckTimeActive} minutes.`
            );
            cleanTimestamps(tagId, latestTimestamp, baseCheckTimeActive);
            return true;
          } else {
            console.log(
              `Loop exited. Incorrect tag status. Current tag status: ${tagStatus}`
            );
            return true;
          }
        } else {
          console.log(
            `Not enough timestamps. Current number of timestamps: ${numberOfTimestamps}`
          );
          return true;
        }
      })
      .catch(error => {
        console.log('The read failed: ' + error);
        return true;
      });
    return true;
  });

// Create cron job for deleting old tag monitors
exports.scheduledFunction = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(context => {
    return admin
      .database()
      .ref('/')
      .once('value', snapshot => {
        snapshot.forEach(tag => {
          const tagValue = tag.val();
          const currentTimestamp = Date.now();
          if (
            millisecondsToMinutes(currentTimestamp - tagValue.latestTimestamp) >
              baseCheckTimeActive &&
            tagValue.status === 'active'
          ) {
            admin
              .database()
              .ref(tag.key)
              .remove();
            console.log(`Cron Job 'Active' Removed: ${tag.key}`);
          } else {
            console.log(`Cron Job 'Active' Kept: ${tag.key}`);
          }
        });
      });
  });

// Create cron job for deleting old tag monitors
exports.scheduledCleanPausedTags = functions.pubsub
  .schedule(`every ${baseCheckTimePaused} minutes`)
  .onRun(context => {
    return admin
      .database()
      .ref('/')
      .once('value', snapshot => {
        snapshot.forEach(tag => {
          const tagValue = tag.val();
          const currentTimestamp = Date.now();
          if (
            millisecondsToMinutes(currentTimestamp - tagValue.latestTimestamp) >
              baseCheckTimePaused &&
            tagValue.status === 'paused'
          ) {
            admin
              .database()
              .ref(tag.key)
              .remove();
            console.log(`Cron Job 'Paused' Removed: ${tag.key}`);
          } else {
            console.log(`Cron Job 'Paused' Kept: ${tag.key}`);
          }
        });
      });
  });
