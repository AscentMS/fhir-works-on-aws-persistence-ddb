/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import each from 'jest-each';
import { updateStatusStatusHandler } from './updateStatus';
import { BulkExportStateMachineGlobalParameters } from './types';
import DynamoDbParamBuilder from '../dataServices/dynamoDbParamBuilder';

const jobOwnerId = 'owner-1';

describe('updateStatus', () => {
    const event: BulkExportStateMachineGlobalParameters = {
        jobId: '1',
        jobOwnerId,
        exportType: 'system',
        transactionTime: '',
        executionParameters: {
            glueJobRunId: 'jr_1',
        },
    };

    const dynamoDbMock = mockClient(DynamoDB);
    
    beforeEach(() => {
        process.env.GLUE_JOB_NAME = 'jobName';
        dynamoDbMock.reset();
    });

    afterAll(() => {
        dynamoDbMock.restore();
    });

    test('valid status', async () => {
        /*
        AWSMock.mock('DynamoDB', 'updateItem', (params: any, callback: Function) => {
            callback(null);
        });
        */
        dynamoDbMock
            .on(UpdateItemCommand)
            .resolvesOnce({
                $metadata: {
                    httpStatusCode: 200,
                }
            });

        await expect(
            updateStatusStatusHandler({ globalParams: event, status: 'completed' }, null as any, null as any),
        ).resolves.toBeUndefined();
        expect(dynamoDbMock).toHaveReceivedCommand(UpdateItemCommand);
    });

    test('valid status in multi-tenancy mode', async () => {
        /*
        const updateSpy = sinon.spy();
        AWSMock.mock('DynamoDB', 'updateItem', (params: any, callback: Function) => {
            updateSpy(params);
            callback(null);
        });
        */
        dynamoDbMock
            .on(UpdateItemCommand)
            .resolvesOnce({
                $metadata: {
                    httpStatusCode: 200,
                }
            });

        await expect(
            updateStatusStatusHandler(
                { globalParams: { ...event, tenantId: 'tenant1' }, status: 'completed' },
                null as any,
                null as any,
            ),
        ).resolves.toBeUndefined();
        /*
        expect(updateSpy.getCall(0).args[0]).toMatchObject(
            DynamoDbParamBuilder.buildUpdateExportRequestJobStatus('1', 'completed', 'tenant1'),
        );
        */
        expect(dynamoDbMock.call(0).args[0].input).toEqual(
            DynamoDbParamBuilder.buildUpdateExportRequestJobStatus('1', 'completed', 'tenant1'),
        );
    });

    describe('Invalid status', () => {
        each([null, undefined, 'not-a-valid-status']).test('%j', async (status: any) => {
            await expect(
                updateStatusStatusHandler({ globalParams: event, status }, null as any, null as any),
            ).rejects.toThrow(`Invalid status "${status}"`);
        });
    });
});