/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { Glue, StartJobRunCommand } from '@aws-sdk/client-glue';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

import { BulkExportStateMachineGlobalParameters } from './types';
import { startExportJobHandler } from './startExportJob';


const jobOwnerId = 'owner-1';

describe('getJobStatus', () => {
    const glueMock = mockClient(Glue);

    beforeEach(() => {
        process.env.GLUE_JOB_NAME = 'jobName';
        glueMock.reset();
    });

    afterAll(() => {
        glueMock.restore();
    });
    test('start job', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
        };
        process.env.GLUE_JOB_NAME = 'jobName';
        /*
        AWSMock.mock('Glue', 'startJobRun', (params: any, callback: Function) => {
            callback(null, {
                JobRunId: 'jr_1',
            });
        });
        */

        glueMock.on(StartJobRunCommand).resolvesOnce({
            JobRunId: 'jr_1',
        });
        
        await expect(startExportJobHandler(event, null as any, null as any)).resolves.toEqual({
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            executionParameters: {
                glueJobRunId: 'jr_1',
            },
        });
    });

    test('start job in multi-tenancy mode', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            tenantId: 'tenant1',
            exportType: 'system',
            transactionTime: '',
        };
        process.env.GLUE_JOB_NAME = 'jobName';
        /*
        AWSMock.mock('Glue', 'startJobRun', (params: any, callback: Function) => {
            callback(null, {
                JobRunId: 'jr_1',
            });
        });
        */

        glueMock.on(StartJobRunCommand).resolvesOnce({
            JobRunId: 'jr_1',
        });
        
        await expect(startExportJobHandler(event, null as any, null as any)).resolves.toEqual({
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
            tenantId: 'tenant1',
            executionParameters: {
                glueJobRunId: 'jr_1',
            },
        });
    });

    test('glue exception', async () => {
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
        };
        process.env.GLUE_JOB_NAME = 'jobName';
        /*
        AWSMock.mock('Glue', 'startJobRun', (params: any, callback: Function) => {
            callback(new Error('Error from Glue'));
        });
        */

        glueMock.on(StartJobRunCommand).rejectsOnce('Error from Glue');

        await expect(startExportJobHandler(event, null as any, null as any)).rejects.toThrow('Error from Glue');
    });

    test('missing env variables ', async () => {
        delete process.env.GLUE_JOB_NAME;
        const event: BulkExportStateMachineGlobalParameters = {
            jobId: '1',
            jobOwnerId,
            exportType: 'system',
            transactionTime: '',
        };
        await expect(startExportJobHandler(event, null as any, null as any)).rejects.toThrow(
            'GLUE_JOB_NAME environment variable is not defined',
        );
    });
});
