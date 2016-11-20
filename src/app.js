let express  = require('express');
let bodyParser = require('body-parser');
let path = require('path');
let Twitter = require('twitter');
let config = require('./config');
let _ = require('lodash');

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
            return console.log('stream limit - ', limitMessage);
        });
        stream.on('end', (response) => {
            // setTimeout(runStream, 600);
        });
        stream.on('error', function(error) {
            console.log('stream err - ', error);
            stream.destroy();
            // setTimeout(runStream, 600);
        });
        stream.on('destroy', (response) => {
            console.log('silently destroyed connection');
        });
        stream.on('warning', function(warning) {
            return console.log('stream warning - ', warning);
        });
        stream.on('disconnect', function(disconnectMessage) {
            return console.log('stream disconnected - ', disconnectMessage);
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
            console.log(JSON.stringify(tweet));
            if ((tweet.loc_lat && tweet.loc_lon) || tweet.loc_name || true) {
                snsSubscribe(tweet);
            }
        });
    });
};
app.get('/start', (req, res) => {
    runStream();
});
let aws = require('aws-sdk');
aws.config.update(config.aws);
let sns = new aws.SNS();
let snsSubscribe = (tweet) => {
    let publishParams = {
        TopicArn : config.TopicArn,
        Message: JSON.stringify(tweet)
        // MessageStructure: 'json',
        // MessageAttributes: {
        //     author: {
        //         DataType: 'STRING_VALUE'
        //     },
        //     avatar: {
        //         DataType: 'STRING_VALUE'
        //     },
        //     body: {
        //         DataType: 'STRING_VALUE'
        //     },
        //     date: {
        //         DataType: 'STRING_VALUE'
        //     },
        //     screenname: {
        //         DataType: 'STRING_VALUE'
        //     },
        //     favs: {
        //         DataType: 'STRING_VALUE'
        //     },
        //     retweets: {
        //         DataType: 'STRING_VALUE'
        //     },
        //     loc_name: {
        //         DataType: 'STRING_VALUE'
        //     },
        //     loc_lat: {
        //         DataType: 'STRING_VALUE'
        //     },
        //     loc_lon: {
        //         DataType: 'STRING_VALUE'
        //     }
        // }
    };

    sns.publish(publishParams, (err, data) => {
        console.log(err, data);
    });
}
let sqs = new aws.SQS();
let MonkeyLearn = require('monkeylearn');
let ml = new MonkeyLearn(config.monkey_learn_key);

function getMessages() {
    let receiveMessageParams = {
        QueueUrl: config.QueueUrl,
        MaxNumberOfMessages: 10
    };    
    sqs.receiveMessage(receiveMessageParams, (err, data) => {
        if (data && data.Messages && data.Messages.length > 0) {
            for (var i=0; i < data.Messages.length; i++) {
                //TODO: third party api on msg
                let sentiment = ml.classifiers.classify(config.ml_module_id, [data.Messages[i].text], true);
                sentiment.then((res) => {
                    console.log(res.result[0][0].label);
                    //SNS to another queue
                });
                var deleteMessageParams = {
                    QueueUrl: config.QueueUrl,
                    ReceiptHandle: data.Messages[i].ReceiptHandle
                };

                sqs.deleteMessage(deleteMessageParams, (err, data) => {});
            }

            getMessages();
        } else {
            setTimeout(getMessages, 60);
        }
    });
}

//TODO: SQS for sentiment queue

// setTimeout(getMessages, 5);
let server = app.listen(app.get('port'), () => {
    console.log('App is listening on port ', server.address().port);
})