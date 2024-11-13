/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Handler } from 'aws-lambda';

import { BulkExportStateMachineGlobalParameters } from './types';
import DynamoDbParamBuilder from '../dataServices/dynamoDbParamBuilder';
import { buildHashKey } from '../dataServices/dynamoDbUtil';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Glue } from '@aws-sdk/client-glue';

export const getJobStatusHandler: Handler<
    BulkExportStateMachineGlobalParameters,
    BulkExportStateMachineGlobalParameters
> = async (event) => {
    const { GLUE_JOB_NAME } = process.env;
    if (GLUE_JOB_NAME === undefined) {
        throw new Error('GLUE_JOB_NAME environment variable is not defined');
    }
    const glueJobRunId = event.executionParameters?.glueJobRunId;
    if (glueJobRunId === undefined) {
        throw new Error('executionParameters.glueJobRunId is missing in input event');
    }

    const hashKey = buildHashKey(event.jobId, event.tenantId);

    const [getJobRunResponse, getItemResponse] = await Promise.all([
        new Glue().getJobRun({ JobName: GLUE_JOB_NAME, RunId: glueJobRunId }),
        new DynamoDB().getItem(DynamoDbParamBuilder.buildGetExportRequestJob(hashKey)),
    ]);

    if (!getItemResponse.Item) {
        // This should never happen. It'd mean that the DDB record was deleted in the middle of the bulk export state machine execution
        // or that the wrong jobId was passed to step functions.
        throw new Error(`FHIR bulk export job was not found for jobId=${hashKey}`);
    }

    const { jobStatus } = unmarshall(getItemResponse.Item);
    const glueJobStatus = getJobRunResponse.JobRun!.JobRunState!;

    return {
        ...event,
        executionParameters: {
            ...event.executionParameters,
            glueJobRunStatus: glueJobStatus,
            isCanceled: jobStatus === 'canceling' || jobStatus === 'canceled',
        },
    };
};
