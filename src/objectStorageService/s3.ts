/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { S3 as AwsS3 } from '@aws-sdk/client-s3';

const { IS_OFFLINE } = process.env;

let binaryBucket = process.env.FHIR_BINARY_BUCKET || '';
let s3KMSKey = process.env.S3_KMS_KEY || '';
if (IS_OFFLINE === 'true') {
    binaryBucket = process.env.OFFLINE_BINARY_BUCKET || '';
    s3KMSKey = process.env.OFFLINE_S3_KMS_KEY || '';
}

export const FHIR_BINARY_BUCKET = binaryBucket;
export const S3_KMS_KEY = s3KMSKey;

export const S3 = new AwsS3([{ signatureVersion: 'v4', sslEnabled: true, }]);
export default S3;
