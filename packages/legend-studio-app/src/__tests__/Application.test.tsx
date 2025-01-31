/**
 * Copyright (c) 2020-present, Goldman Sachs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { getTestApplicationConfig, LegendStudio } from '@finos/legend-studio';
import type { AbstractPluginManager } from '@finos/legend-studio-shared';
import {
  AbstractPreset,
  integrationTest,
  MOBX__disableSpyOrMock,
  MOBX__enableSpyOrMock,
} from '@finos/legend-studio-shared';
import studioConfig from '../../studio.config';

class Dummy_Preset extends AbstractPreset {
  constructor() {
    super('dummy', '0.0.0');
  }

  install(pluginManager: AbstractPluginManager): void {
    return;
  }
}

test(integrationTest('Application can start with a dummy preset'), async () => {
  const application = LegendStudio.create();

  MOBX__enableSpyOrMock();
  jest
    .spyOn(application, 'fetchApplicationConfiguration')
    .mockResolvedValue([getTestApplicationConfig(), {}]);
  MOBX__disableSpyOrMock();

  application
    .setup({ baseUrl: studioConfig.baseUrl })
    .withPresets([new Dummy_Preset()])
    .start()
    .catch((e) => {
      throw e;
    });
});
