let express  = require('express');
let bodyParser = require('body-parser');
let path = require('path');
let Twitter = require('twitter');
let config = require('./config');
let _ = require('lodash');
let ejs =  require('ejs');

// let async = require('async'); TODO: USE IT, LEARN IT!

let app = express();
const port = 8080;
app.set('port', process.env.PORT || port);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'))
app.use(bodyParser.urlencoded({extended: false}));
let twit = new Twitter(config.twitter);
let runStream = () => {
    console.log('stream running again');
    twit.stream('statuses/filter', _.merge(config.stream.location, config.stream.words), function(s) {
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
            console.log(data);
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
            io.emit('raw_tweet', tweet);
            if ((tweet.loc_lat && tweet.loc_lon)) {
                snsSubscribeNewTweet(tweet);
            }
        });
    });
};

app.get('/start', (req, res) => {
    runStream();
    elastic_client.search({
        index: config.es.index,
        type: config.es.doc_type,
        body: {
            query: {
                match_all: {}    
            },
            size: 200
        }
    },function (error, response, status) {
        if (error){
            console.log("search error: "+error);
        }
        else {
            console.log('query worked');
            let tweets = [];
            response.hits.hits.forEach(function(hit){
                tweets.push(hit._source);
            });
            console.log(tweets.length);
            res.render('index', {tweets});
        }
    });
});

app.get('/search', (req, res) => {
    let search_term = req.query.search_term || '';
    let search_query = {};
    search_term = search_term.toLowerCase();
    if (search_term === '') {
        search_query.match_all = {}; //all tweets
    } else {
        search_query.term = { "body" : search_term };
    }
    elastic_client.search({
        index: config.es.index,
        type: config.es.doc_type,
        body: {
            query: search_query,
            size: 2000
        }
    },function (error, response, status) {
        if (error){
            console.log("search error: "+error);
        }
        else {
            let tweets = [];
            response.hits.hits.forEach(function(hit){
                tweets.push(hit._source);
            });
            res.json(tweets);
        }
    });
});

let aws = require('aws-sdk');
aws.config.update(config.aws);
let sns = new aws.SNS();
let snsSubscribeNewTweet = (tweet) => {
    let publishParams = {
        TopicArn : config.TopicArnGeo,
        Message: JSON.stringify(tweet)
    };

    sns.publish(publishParams, (err, data) => {
        console.log(err, data);
    });
    io.emit('new_tweet', tweet);
}
let snsSubscribeSentimentTweet = (tweet) => {
    console.log(tweet);
    let publishParams = {
        TopicArn : config.TopicArnSentiment,
        Message: JSON.stringify(tweet)
    };

    sns.publish(publishParams, (err, data) => {});
}
let sqs = new aws.SQS();
let MonkeyLearn = require('monkeylearn');
let ml = new MonkeyLearn(config.monkey_learn_key);

let elasticsearch = require('elasticsearch');
const elastic_client = new elasticsearch.Client({
    hosts: [
        {
            protocol: 'https',
            host: config.es.host,
            port: 443
        }
        // ,
        // {
        //     host: 'localhost',
        //     port: 9200
        // }
    ]
});

function getMessages() {
    let receiveMessageParams = {
        QueueUrl: config.QueueUrlGeo,
        MaxNumberOfMessages: 5
    };
    sqs.receiveMessage(receiveMessageParams, (err, data) => {
        console.log('getmessages repeat');
        if (data && data.Messages && data.Messages.length > 0) {
            var tweets = data.Messages.map((msg) => {
                var tweet = JSON.parse(_.get(msg, 'Body'));
                tweet = _.get(tweet, 'Message');
                return JSON.parse(tweet);
            });
            //TODO: IMportant. fix async issue i.e. loop through tweets async calls ------

            calcSentiment(tweets).then((sentiments) => {
                //SNS
                sentiment_tweets = _.zipWith(tweets, sentiments, function(t, s) {
                    return _.merge(t, {'sentiment': s});
                });
                sentiment_tweets.forEach((st) => {
                    snsSubscribeSentimentTweet(st);
                });
                getMessages(); //repeat
            });

            for (var i=0; i < data.Messages.length; i++) {
                var tweet = JSON.parse(_.get(data, 'Messages['+i+'].Body'));
                tweet = _.get(tweet, 'Message');

                var deleteMessageParams = {
                    QueueUrl: config.QueueUrlGeo,
                    ReceiptHandle: data.Messages[i].ReceiptHandle
                };

                sqs.deleteMessage(deleteMessageParams, (err, data) => {});
            }
        } else {
            setTimeout(getMessages, 300000);
        }
    });
}

function upload2ES() {
    let receiveMessageParams = {
        QueueUrl: config.QueueUrlSentiment,
        MaxNumberOfMessages: 5
    };
    sqs.receiveMessage(receiveMessageParams, (err, data) => {
        console.log('upload2ES repeat');
        if (data && data.Messages && data.Messages.length > 0) {
            var tweets = data.Messages.map((msg) => {
                var tweet = JSON.parse(_.get(msg, 'Body'));
                tweet = _.get(tweet, 'Message');
                return JSON.parse(tweet);
            });

            for (var i=0; i < data.Messages.length; i++) {
                var tweet = JSON.parse(_.get(data, 'Messages['+i+'].Body'));
                tweet = _.get(tweet, 'Message');

                var deleteMessageParams = {
                    QueueUrl: config.QueueUrlSentiment,
                    ReceiptHandle: data.Messages[i].ReceiptHandle
                };

                sqs.deleteMessage(deleteMessageParams, (err, data) => {});
            }

            //ES bulk upload
            let bulk_tweets = [];
            tweets.forEach((t) => {
                if (true || t.loc_lat && t.loc_lon) {
                    console.log(t);
                    bulk_tweets.push(
                        { index: {_index: config.es.index, _type: config.es.doc_type} },
                        t
                    );
                }
            });

            if (bulk_tweets.length > 0) {
                elastic_client.bulk({
                    maxRetries: 5,
                    index: config.es.index,
                    type: config.es.doc_type,
                    body: bulk_tweets
                }, function(err,resp,status) {
                    if (err) {
                        console.log(err);
                    }
                    else {
                        console.log('this many docs added - ',resp.items.length);  
                    }
                    upload2ES();
                });
            } else {
                upload2ES();
            }

        } else {
            setTimeout(upload2ES, 180000);
        }
    });    
}

//pass the tweet texts as an array
let calcSentiment = (tweets) => {
    return new Promise((resolve, reject) => {
        let tweet_texts = tweets.map((t) => {
            return _.get(t, 'body');
        });
        let sentiment = ml.classifiers.classify(config.ml_module_id, tweet_texts, true);
        sentiment.then((res) => {
            var results = res.result.map((r) => {
                return (_.get(r, '[0].label'));
            });
            resolve(results);
        });
    });
}

let keepSocketAlive = () => {
    io.emit('polling', {});
    setTimeout(keepSocketAlive, 5000);
};

// setTimeout(getMessages, 5000);
// setTimeout(upload2ES, 10000);
setTimeout(keepSocketAlive, 1000);
let server = app.listen(app.get('port'), () => {
    console.log('App is listening on port ', server.address().port);
})
const io = require('socket.io').listen(server);
io.on('connection', (socket) => {
    socket.emit('server connected');
});