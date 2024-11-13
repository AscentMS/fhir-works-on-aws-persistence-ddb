/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB } from "@aws-sdk/client-dynamodb";

export const DynamoDb = new DynamoDB();

export const RESOURCE_TABLE = process.env.RESOURCE_TABLE || '';

export const EXPORT_REQUEST_TABLE = process.env.EXPORT_REQUEST_TABLE || '';

export const EXPORT_REQUEST_TABLE_JOB_STATUS_INDEX = process.env.EXPORT_REQUEST_TABLE_JOB_STATUS_INDEX || '';
