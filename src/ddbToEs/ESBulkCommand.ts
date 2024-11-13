/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

export type OperationType = 'delete' | 'upsert-AVAILABLE' | 'upsert-DELETED';

export default interface ESBulkCommand {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bulkCommand: any[];
    /**
     * This will be a unique identifier or composite id i.e. `<id>_<vid>`
     */
    id: string;
    type: OperationType;
}
