const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');

app.get('/fuel-estimate', (req, res) => {
	res.send('This is the contact page');
});

app.get('/maintenance-schedule', (req, res) => {
	res.send('This is the about page');
});

app.get('/analytics', (req, res) => {
	res.send('<h1>Hello World!</h1>');
});

const port = 3000;
app.listen(port, () => {
	console.log(`Server is running on port ${port}`);
});