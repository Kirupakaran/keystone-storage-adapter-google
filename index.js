/*
TODO
- Check whether files exist before uploading (will always overwrite as-is)
- Support multiple retry attempts if a file exists (see FS Adapter)
*/

// Mirroring keystone 4's support of node v6.
var fs = require('fs');
var pathlib = require('path');
var assign = require('object-assign');
var debug = require('debug')('keystone-s3');
var ensureCallback = require('keystone-storage-namefunctions/ensureCallback');
var nameFunctions = require('keystone-storage-namefunctions');
var Storage = require('@google-cloud/storage');

var DEFAULT_OPTIONS = {
	projectId: process.env.GCLOUD_PROJECT_ID,
	bucket: process.env.GCLOUD_BUCKET,
	path: '/',
	generateFilename: nameFunctions.randomFilename
};

function ensureLeadingSlash (filename) {
	return filename[0] !== '/' ? '/' + filename : filename;
}

function removeLeadingSlash (filename) {
	return filename[0] === '/' ? filename.substring(1) : filename;
}

function encodeSpecialCharacters (filename) {
	// Note: these characters are valid in URIs, but S3 does not like them for
	// some reason.
	return encodeURI(filename).replace(/[!'()#*+? ]/g, function (char) {
		return '%' + char.charCodeAt(0).toString(16);
	});
}

// This constructor is usually called indirectly by the Storage class
// in keystone.

// S3-specific options should be specified in an `options.s3` field,
// which can contain the following options: { key, secret, bucket, region,
// path, uploadParams, publicUrl }.

// The schema can contain the additional fields { path, bucket, etag }.

// See README.md for details and usage examples.

function GCloudAdapter (options, schema) {
	var self = this;
	this.options = assign({}, DEFAULT_OPTIONS, options.gcloud);

	// Check required options are set.
	var requiredOptions = ['projectId', 'bucket'];
	requiredOptions.forEach(function (key) {
		if (!self.options[key]) {
			throw new Error('Configuration error: Missing required option `' + key + '`');
		}
	});

	// Ensure the path has a leading "/"
	this.options.path = ensureLeadingSlash(this.options.path);

	// Create the s3 client
	this.gcloudClient = new Storage();

	// Ensure the generateFilename option takes a callback
	this.options.generateFilename = ensureCallback(this.options.generateFilename);
}

GCloudAdapter.compatibilityLevel = 1;

// All the extra schema fields supported by this adapter.
GCloudAdapter.SCHEMA_TYPES = {
	filename: String,
	bucket: String,
	path: String,
	etag: String,
};

GCloudAdapter.SCHEMA_FIELD_DEFAULTS = {
	filename: true,
	bucket: false,
	path: false,
	etag: false,
};

GCloudAdapter.prototype._resolveBucket = function (file) {
	if (file && file.bucket) {
		return file.bucket;
	} else {
		return this.options.bucket;
	}
};

GCloudAdapter.prototype._resolvePath = function (file) {
	// Just like the bucket, the schema can store the path for files. If the path
	// isn't stored we'll assume all the files are in the path specified in the
	// s3.path option which defaults to the root of the bucket.
	const path = (file && file.path) || this.options.path;
	// We still need to ensureconsole.log(data);LeadingSlash here as older versions of this
	// adapter did not so there may be bad data for file.path in the DB.
	return ensureLeadingSlash(path);
};

// Get the absolute path name for the specified file.
GCloudAdapter.prototype._resolveAbsolutePath = function (file) {
	var path = this._resolvePath(file);
	var filename = pathlib.posix.resolve(path, file.filename);
	return encodeSpecialCharacters(filename);
};

GCloudAdapter.prototype.uploadFile = function (file, callback) {
	var self = this;
	this.options.generateFilename(file, 0, function (err, filename) {
		if (err) return callback(err);

		// The expanded path of the file on the filesystem.
		var localpath = file.path;
		// Grab the mimetype so we can set ContentType in S3
		var mimetype = file.mimetype;

		file.filename = filename;
		var absolutePath = self._resolveAbsolutePath(file);
		var bucket = self._resolveBucket();

		debug('Uploading file "%s" to "%s" bucket with mimetype "%s"', absolutePath, bucket, mimetype);

		self.gcloudClient
			.bucket(bucket)
			.upload(localpath, {
				gzip: true, 
				metadata: {
					cacheControl: 'public, max-age=31536000',
				},
				public: true
			})
			.then((data) => {
				file.path = '';
				file.etag = data[1].etag;
				file.filename = data[1].name;
				return callback(null, file);
			})
			.catch((err) => callback(err));
	});
};

// Note that this will provide a public URL for the file, but it will only
// work if:
// - the bucket is public (best) or
// - the file is set to a canned ACL (ie, uploadParams:{ ACL: 'public-read' } )
// - you pass credentials during your request for the file content itself
GCloudAdapter.prototype.getFileURL = function (file) {
	var bucket = this._resolveBucket(file);
	var absolutePath = this._resolveAbsolutePath(file);

	return 'https://storage.cloud.google.com/' + bucket + absolutePath;
};

GCloudAdapter.prototype.removeFile = function (file, callback) {
	debug('Removing file "%s" from "%s" bucket', file, bucket);

	this.gcloudClient
		.bucket(bucket)
		.file(file.name)
		.delete()
		.then(() => callback())
		.catch((err) => callback(err));
};

// Check if a file with the specified filename already exists. Callback called
// with the file headers if the file exists, null otherwise.
GCloudAdapter.prototype.fileExists = function (filename, callback) {
	var bucket = this._resolveBucket();

	debug('Checking file exists "%s" in "%s" bucket', filename, bucket);


	this.gcloudClient
		.bucket(bucket)
		.file(filename)
		.exists(function (err, data) {
		if (err) return callback(err);
		else callback(null, data[0]);
	});
};

module.exports = GCloudAdapter;
