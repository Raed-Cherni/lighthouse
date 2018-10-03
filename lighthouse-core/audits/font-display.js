/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Audit = require('./audit');
const URL = require('../lib/url-shim').URL;
const PASSING_FONT_DISPLAY_REGEX = /block|fallback|optional|swap/;
const CSS_URL_REGEX = /url\((.*?)\)/;
const CSS_URL_GLOBAL_REGEX = new RegExp(CSS_URL_REGEX, 'g');
const i18n = require('../lib/i18n/i18n.js');

const UIStrings = {
  /** Title of a diagnostic audit that provides detail on if all the text on a webpage was visible while the page was loading its webfonts. This descriptive title is shown to users when the amount is acceptable and no user action is required. */
  title: 'All text remains visible during webfont loads',
  /** Title of a diagnostic audit that provides detail on the load of the page's webfonts. Often the text is invisible for seconds before the webfont resource is loaded. This imperative title is shown to users when there is a significant amount of execution time that could be reduced. */
  failureTitle: 'Ensure text remains visible during webfont load',
  /** Description of a Lighthouse audit that tells the user *why* they should use the font-display CSS feature. This is displayed after a user expands the section to see more. No character length limits. 'Learn More' becomes link text to additional documentation. */
  description:
    'Leverage the font-display CSS feature to ensure text is user-visible while ' +
    'webfonts are loading. ' +
    '[Learn more](https://developers.google.com/web/updates/2016/02/font-display).',
};

const str_ = i18n.createMessageInstanceIdFn(__filename, UIStrings);

class FontDisplay extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'font-display',
      title: str_(UIStrings.title),
      failureTitle: str_(UIStrings.failureTitle),
      description: str_(UIStrings.description),
      requiredArtifacts: ['devtoolsLogs', 'CSSUsage', 'URL'],
    };
  }

  /**
   *
   * @param {LH.Artifacts} artifacts
   */
  static findPassingFontDisplayDeclarations(artifacts) {
    /** @type {Set<string>} */
    const passingURLs = new Set();

    for (const stylesheet of artifacts.CSSUsage.stylesheets) {
      const newlinesStripped = stylesheet.content.replace(/\n/g, ' ');
      const fontFaceDeclarations = newlinesStripped.match(/@font-face\s*{(.*?)}/g) || [];
      for (const declaration of fontFaceDeclarations) {
        const rawFontDisplay = declaration.match(/font-display:(.*?);/);
        if (!rawFontDisplay) continue;
        const hasPassingFontDisplay = PASSING_FONT_DISPLAY_REGEX.test(rawFontDisplay[0]);
        if (!hasPassingFontDisplay) continue;

        const rawFontURLs = declaration.match(CSS_URL_GLOBAL_REGEX);
        if (!rawFontURLs) continue;

        const relativeURLs = rawFontURLs
          // @ts-ignore - guaranteed to match from previous regex, pull URL group out
          .map(s => s.match(CSS_URL_REGEX)[1].trim())
          // remove any optional quotes before/after
          .map(s => {
            const firstChar = s.charAt(0);
            if (firstChar === s.charAt(s.length - 1) && (firstChar === '"' || firstChar === '\'')) {
              return s.substr(1, s.length - 2);
            }

            return s;
          });

        const absoluteURLs = relativeURLs.map(url => new URL(url, artifacts.URL.finalUrl));

        for (const url of absoluteURLs) {
          passingURLs.add(url.href);
        }
      }
    }

    return passingURLs;
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @return {Promise<LH.Audit.Product>}
   */
  static async audit(artifacts) {
    const devtoolsLogs = artifacts.devtoolsLogs[this.DEFAULT_PASS];
    const networkRecords = await artifacts.requestNetworkRecords(devtoolsLogs);
    const passingFontURLs = FontDisplay.findPassingFontDisplayDeclarations(artifacts);

    const results = networkRecords
      // Find all fonts...
      .filter(record => record.resourceType === 'Font')
      // ...that don't have a passing font-display value
      .filter(record => !passingFontURLs.has(record.url))
      .map(record => {
        // In reality the end time should be calculated with paint time included
        // all browsers wait 3000ms to block text so we make sure 3000 is our max wasted time
        const wastedMs = Math.min((record.endTime - record.startTime) * 1000, 3000);

        return {
          url: record.url,
          wastedMs,
        };
      });

    const headings = [
      {key: 'url', itemType: 'url', text: str_(i18n.UIStrings.columnURL)},
      {key: 'wastedMs', itemType: 'ms', text: str_(i18n.UIStrings.columnWastedMs)},
    ];

    const details = Audit.makeTableDetails(headings, results);

    return {
      score: Number(results.length === 0),
      rawValue: results.length === 0,
      details,
    };
  }
}

module.exports = FontDisplay;
module.exports.UIStrings = UIStrings;
