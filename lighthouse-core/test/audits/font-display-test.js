/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('../../audits/font-display.js');
const assert = require('assert');

/* eslint-env jest */

describe('Performance: Font Display audit', () => {
  let artifacts;
  let networkRecords;
  let stylesheet;

  beforeEach(() => {
    stylesheet = {content: ''};
    artifacts = {
      devtoolsLogs: {[Audit.DEFAULT_PASS]: []},
      requestNetworkRecords: () => Promise.resolve(networkRecords),
      URL: {finalUrl: 'https://example.com/foo/bar/page'},
      CSSUsage: {stylesheets: [stylesheet]},
    };
  });

  it('fails when not all fonts have a correct font-display rule', async () => {
    stylesheet.content = `
      @font-face {
        src: url("./font-a.woff");
      }

      @font-face {
        src: url('../font-b.woff');
      }

      @font-face {
        src: url(font.woff);
      }
    `;

    networkRecords = [
      {
        url: 'https://example.com/foo/bar/font-a.woff',
        endTime: 3, startTime: 1,
        resourceType: 'Font',
      },
      {
        url: 'https://example.com/foo/font-b.woff',
        endTime: 5, startTime: 1,
        resourceType: 'Font',
      },
      {
        url: 'https://example.com/foo/bar/font.woff',
        endTime: 2, startTime: 1,
        resourceType: 'Font',
      },
    ];

    const result = await Audit.audit(artifacts);
    const items = [
      {url: networkRecords[0].url, wastedMs: 2000},
      {url: networkRecords[1].url, wastedMs: 3000},
      {url: networkRecords[2].url, wastedMs: 1000},
    ];
    assert.strictEqual(result.rawValue, false);
    assert.deepEqual(result.details.items, items);
  });

  it('passes when all fonts have a correct font-display rule', async () => {
    stylesheet.content = `
      @font-face {
        font-display: 'block';
        src: url("./font-a.woff");
      }

      @font-face {
        font-display: 'fallback';
        src: url('../font-b.woff');
      }

      @font-face {
        font-display: 'optional';
        src: url(font.woff);
      }
    `;

    networkRecords = [
      {
        url: 'https://example.com/foo/bar/font-a.woff',
        endTime: 3, startTime: 1,
        resourceType: 'Font',
      },
      {
        url: 'https://example.com/foo/font-b.woff',
        endTime: 5, startTime: 1,
        resourceType: 'Font',
      },
      {
        url: 'https://example.com/foo/bar/font.woff',
        endTime: 2, startTime: 1,
        resourceType: 'Font',
      },
    ];

    const result = await Audit.audit(artifacts);
    assert.strictEqual(result.rawValue, true);
    assert.deepEqual(result.details.items, []);
  });
});
