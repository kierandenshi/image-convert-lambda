const express = require('express');
const multer = require('multer');
const serverless = require('serverless-http');
const cors = require('cors');
const aws = require('aws-sdk');
const gm = require('gm').subClass({ imageMagick: true });
const s3 = new aws.S3();
const app = express();
const upload = multer({
    limits: { fieldSize: 25 * 1024 * 1024 },
});

const convertToJpeg = (base64buffer) => new Promise((resolve, reject) => {
    gm(base64buffer).antialias(true).density(300).toBuffer('JPG', (err, buffer) => (
        err ? reject(err) : resolve(buffer)
    ));
});

const uploadToS3Bucket = ({ buffer, filename }) => new Promise((resolve, reject) => {
    const params = {
        Bucket: 'campaign-ui-original',
        Key: `${filename}.jpg`,
        Body: buffer,
        ACL: 'public-read',
        ContentType: 'JPG',
    };

    s3.upload(params, (err, data) => (
        err ? reject(err) : resolve(data)
    ));
});

const processImage = ({ content, filename }) => new Promise((resolve, reject) => {
    const base64Data = content.replace(/^data:\w*\/\w*;base64,/gm, '');
    const base64buffer = new Buffer(base64Data, 'base64');
    convertToJpeg(base64buffer)
        .then(jpegBuffer => uploadToS3Bucket({ buffer: jpegBuffer, filename }))
        .then(data => resolve(data))
        .catch(err => reject(err));
});

app.use(cors());

app.get('/', (req, res) => {
    res.send('hello');
});

app.post('/upload', upload.array(), (req, res) => {
    const data = JSON.parse(req.body.data);
    const actions = data.map(processImage);
    Promise.all(actions)
        .then(result => res.json({ data: result }))
        .catch(err => res.json({ error: err }));
});

module.exports.handler = serverless(app);

// enable running locally for testing
!(process.env.LAMBDA_TASK_ROOT && process.env.AWS_EXECUTION_ENV) && app.listen(9100);
