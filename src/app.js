let express  = require('express');
let bodyParser = require('body-parser');
let path = require('path');
let Twitter = require('twitter');
let config = require('./config');

let app = express();
const port = 8080;
app.set('port', process.env.PORT || port);
app.set('view engine', 'hbs');
// app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({extended: false}));
let twit = new Twitter(config.twitter);
let runStream = () => {
    console.log('stream running again');
    twit.stream('statuses/filter', config.stream.words, function(s) {
        stream = s;
        stream.on('limit', function(limitMessage) {
            return console.log(limitMessage);
        });
        stream.on('end', (response) => {
            setTimeout(runStream, 600);
        });
        stream.on('error', function(error) {
            console.log(error);
            stream.destroy();
            setTimeout(runStream, 600);
        });
        stream.on('destroy', (response) => {
            console.log('silently destroyed connection');
        });
        stream.on('warning', function(warning) {
            return console.log(warning);
        });
        stream.on('disconnect', function(disconnectMessage) {
            return console.log(disconnectMessage);
        });
        stream.on('data',(data) => {
            //tweet obj
            let tweet = {
                author: _.get(data, 'user.name'),
                avatar: _.get(data,'user.profile_image_url'),
                body: _.get(data, 'text'),
                date: _.get(data, 'created_at'),
                screenname: _.get(data, 'user.screen_name'),
                favs: _.get(data,'favorite_count'),
                retweets: _.get(data,'retweet_count'),
                loc_name: _.get(data,'place.full_name'),
                loc_lat: _.get(data,'coordinates.coordinates[1]') || _.get(data,'geo.coordinates[0]'),
                loc_lon: _.get(data,'coordinates.coordinates[0]')|| _.get(data,'geo.coordinates[1]')
            };
            console.log(tweet);
            // Save 'er to the database
            if ((tweet.loc_lat && tweet.loc_lon) || tweet.loc_name) {
                snsSubscribe(tweet);
            }
        });
    });
};
// runStream();

let aws = require('aws-sdk');
let sns = new aws.SNS();
let snsSubscribe = (tweet) => {
    let publishParams = {
        TopicArn : config.TopicArn,
        Message: tweet
    };

    // sns.publish(publishParams, (err, data) => {});
}
let sqs = new aws.SQS();
function getMessages() {
    let receiveMessageParams = {
        QueueUrl: config.QueueUrl,
        MaxNumberOfMessages: 10
    };    
    sqs.receiveMessage(receiveMessageParams, (err, data) => {
        if (data && data.Messages && data.Messages.length > 0) {
            for (var i=0; i < data.Messages.length; i++) {
                //TODO: third party api on msg

                var deleteMessageParams = {
                    QueueUrl: config.QueueUrl,
                    ReceiptHandle: data.Messages[i].ReceiptHandle
                };

                sqs.deleteMessage(deleteMessageParams, (err, data) => {});
            }

            getMessages();
        } else {
            setTimeout(getMessages(), 60);
        }
    });
}

// setTimeout(getMessages(), 60);
let server = app.listen(app.get('port'), () => {
    console.log('App is listening on port ', server.address().port);
})