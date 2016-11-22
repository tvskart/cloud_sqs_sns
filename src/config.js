module.exports = {
    twitter: {
        consumer_key: 'AbhjdWVhSfPoB6PrVi9fsUKSs',
        consumer_secret: 'a2fhEbCRPwnQeMeb4y14IU9wosyNIgrHSqPRj2bZnlX1Y9rul9',
        access_token_key: '716398011362967552-6b3hPWhPoSH38Jre5sy2V0wSnsA3GCZ',
        access_token_secret: 'YvmdBrH2gosQQiO6ZhClY3WCZ7ffvpGPPJMBCulNE9oy8'
    },
    stream: {
        location : {'locations': '-122.75,36.8,-121.75,37.8,-74,40,-73,41'},
        words: {
            'track': '@PointlessBlog, @pewdiepie, @Jenna_Marbles, @Caspar_Lee, @PhillyD, @tyleroakley, @fouseyTUBE, @omgAdamSaleh, @screenjunkies, @RiceGum, @LeafyIsHere, @RomanAtwood, @IISuperwomanII, @realDonaldTrump, gay marriage, @Pokemon'
        },
        empty: {}
    },
    TopicArnGeo: "arn:aws:sns:us-east-1:892410376055:geo_tweets",
    TopicArnSentiment: "arn:aws:sns:us-east-1:892410376055:sentiment_tweets",
    QueueUrl: "https://sqs.us-east-1.amazonaws.com/892410376055/geo_tweets_queue",
    monkey_learn_key: "0f0a835d95c22c050a859454e4a8ce0f1aef6b3b",
    ml_module_id: "cl_qkjxv9Ly",
    aws: {
        'region': 'us-east-1'
    }
};