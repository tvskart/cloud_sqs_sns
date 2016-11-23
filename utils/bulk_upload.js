let elasticsearch = require('elasticsearch');
let config = require(__dirname+'/../src/config');
let _ = require('lodash');
let fs = require('fs');

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

let bulk_upload = () => {
    let bulk_tweets = []
    let file_path = './final_tweet_sentiment.json'
    var stream = fs.createReadStream(file_path, {flags: 'r', encoding: 'utf-8'});
    var buf = '';
    let count = 1;
    stream.on('data', function(d) {
        buf += d.toString(); // when data is read, stash it in a string buffer
        pump(); // then process the buffer
    });

    function pump() {
        var pos;
        while ((pos = buf.indexOf('\n')) >= 0) { // keep going while there's a newline somewhere in the buffer
            if (pos == 0) { // if there's more than one newline in a row, the buffer will now start with a newline
                buf = buf.slice(1); // discard it
                continue; // so that the next iteration will start with data
            }
            processLine(buf.slice(0,pos)); // hand off the line
            count+=1;
            buf = buf.slice(pos+1); // and slice the processed data off the buffer

            if(count >= 6657) { //number of buffer slices
                upload_to_elastic();
            }
        }
    }

    function processLine(line) { // here's where we do something with a line

        if (line[line.length-1] == '\r') line=line.substr(0,line.length-1); // discard CR (0x0D)

        if (line.length > 0) { // ignore empty lines
            var data = JSON.parse(line); // parse the JSON
            if(!_.get(data, 'index')) {
                let tweet = {
                    author: _.get(data, 'user.name'),
                    avatar: _.get(data,'user.profile_image_url'),
                    body: _.get(data, 'text'),
                    date: _.get(data, 'created_at'),
                    screenname: _.get(data, 'user.screen_name'),
                    favs: _.get(data,'favorite_count'),
                    retweets: _.get(data,'retweet_count'),
                    loc_name: _.get(data,'user.location'),
                    loc_lat: _.get(data,'coordinates.lat'),
                    loc_lon: _.get(data,'coordinates.lng'),
                    sentiment: _.get(data, 'sentiment')
                };
                bulk_tweets.push(
                    { index: {_index: config.es.index, _type: config.es.doc_type} },
                    tweet
                );
            }
        }
    }

    let upload_to_elastic = () => {
        elastic_client.bulk({
            maxRetries: 5,
            index: config.es.index,
            type: config.es.doc_type,
            body: bulk_tweets
        },function(err,resp,status) {
            if (err) {
                console.log(err);
            }
            else {
                console.log('this many indices added - ',resp.items.length);
            }
        });        
    }
}


//bulk_upload();