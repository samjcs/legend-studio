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

import { list, primitive, createModelSchema } from 'serializr';
import {
  SerializationFactory,
  usingModelSchema,
} from '@finos/legend-studio-shared';

export class V1_GenerationPropertyItem {
  types: string[] = [];
  enums: string[] = [];

  static readonly serialization = new SerializationFactory(
    createModelSchema(V1_GenerationPropertyItem, {
      types: list(primitive()),
      enums: list(primitive()),
    }),
  );
}

export class V1_GenerationProperty {
  name!: string;
  description!: string;
  type!: string;
  items?: V1_GenerationPropertyItem;
  defaultValue!: string; // we always give string so based on the type of the property, we have to parse this to the appropriate format
  required!: boolean;

  static readonly serialization = new SerializationFactory(
    createModelSchema(V1_GenerationProperty, {
      name: primitive(),
      description: primitive(),
      type: primitive(),
      items: usingModelSchema(V1_GenerationPropertyItem.serialization.schema),
      defaultValue: primitive(),
      required: primitive(),
    }),
  );
}

export class V1_GenerationConfigurationDescription {
  key!: string;
  label!: string;
  properties: V1_GenerationProperty[] = [];
  generationMode!: string;

  static readonly serialization = new SerializationFactory(
    createModelSchema(V1_GenerationConfigurationDescription, {
      key: primitive(),
      label: primitive(),
      properties: usingModelSchema(V1_GenerationProperty.serialization.schema),
      generationMode: primitive(),
    }),
  );
}
