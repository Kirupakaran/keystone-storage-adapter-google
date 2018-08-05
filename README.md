# Google-based storage adapter for KeystoneJS

This adapter is designed to replace the existing `GoogleFile` field in KeystoneJS using the new storage API.

## Usage

Configure the storage adapter:

Add GOOGLE_APPLICATION_CREDENTIALS in .env and give the path to google credentials json file
```js
var storage = new keystone.Storage({
  adapter: require('keystone-storage-adapter-Google'),
  google: {
    projectId: 'Google-key', // required; defaults to process.env.GCLOUD_PROJECT_ID
    bucket: 'mybucket', // required; defaults to process.env.GCLOUD_BUCKET
    path: '/profilepics', // optional; defaults to "/"
  },
  schema: {
    bucket: true, // optional; store the bucket the file was uploaded to in your db
    etag: true, // optional; store the etag for the resource
    path: true, // optional; store the path of the file in your db
    url: true, // optional; generate & store a public URL
  },
});
```

Then use it as the storage provider for a File field:

```js
File.add({
  name: { type: String },
  file: { type: Types.File, storage: storage },
});
```

### Options:

The adapter requires an additional `Google` field added to the storage options. It accepts the following values:

- **projectId**: *(required)* Google Cloud access secret.

- **bucket**: *(required)* Google bucket to upload files to. Bucket must be created before it can be used. Configure your bucket through the Google Cloud console [here](https://console.cloud.google.com/storage).

- **path**: Storage path inside the bucket. By default uploaded files will be stored in the root of the bucket. You can override this by specifying a base path here. Base path must be absolute, for example '/images/profilepics'.


### Schema

The Google adapter supports all the standard Keystone file schema fields. It also supports storing the following values per-file:

- **bucket**, **path**: The bucket, and path within the bucket, for the file can be is stored in the database. If these are present when reading or deleting files, they will be used instead of looking at the adapter configuration. The effect of this is that you can have some (eg, old) files in your collection stored in different bucket / different path inside your bucket.

The main use of this is to allow slow data migrations. If you *don't* store these values you can arguably migrate your data more easily - just move it all, then reconfigure and restart your server.

- **etag**: The etag of the stored item. This is equal to the MD5 sum of the file content.


# Change Log

## v1.0.0

### Overview

The Knox library which this package was previously based on has gone unmaintained for some time and is now failing in many scenarios. This version replaces knox with the official [Google Cloud Javascript SDK](https://Google Cloud.amazon.com/sdk-for-node-js/).

### Other

- **path**: The requirement for `path` to have a **leading slash** has been removed. The previous implementation failed to catch this miss-configuration and Knox helpfully made the file uploads work anyway. This has lead to a situation where it is possible/likely that there are existing installations where a miss-configured path is stored in the database. To avoid breaking these installs we now handle adding or removing the leading slash as required.

# License

Licensed under the standard MIT license. See [LICENSE](license).
