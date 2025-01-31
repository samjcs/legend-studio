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

import { observable, action, computed, makeObservable } from 'mobx';
import {
  LAMBDA_START,
  SOURCE_ID_LABEL,
} from '../../../../models/MetaModelConst';
import { CORE_LOG_EVENT } from '../../../../utils/Logger';
import {
  InstanceSetImplementationState,
  PropertyMappingState,
} from './MappingElementState';
import type { EditorStore } from '../../../EditorStore';
import { MappingElementDecorator } from './MappingElementDecorator';
import { ParserError } from '../../../../models/metamodels/pure/action/EngineError';
import { RawLambda } from '../../../../models/metamodels/pure/model/rawValueSpecification/RawLambda';
import type { PurePropertyMapping } from '../../../../models/metamodels/pure/model/packageableElements/store/modelToModel/mapping/PurePropertyMapping';
import type { PureInstanceSetImplementation } from '../../../../models/metamodels/pure/model/packageableElements/store/modelToModel/mapping/PureInstanceSetImplementation';
import type { GeneratorFn } from '@finos/legend-studio-shared';
import { isNonNullable } from '@finos/legend-studio-shared';
import { buildSourceInformationSourceId } from '../../../../models/metamodels/pure/action/SourceInformationHelper';

export class PurePropertyMappingState extends PropertyMappingState {
  editorStore: EditorStore;
  declare instanceSetImplementationState: PureInstanceSetImplementationState;
  declare propertyMapping: PurePropertyMapping;

  constructor(
    editorStore: EditorStore,
    instanceSetImplementationState: PureInstanceSetImplementationState,
    propertyMapping: PurePropertyMapping,
  ) {
    super(instanceSetImplementationState, propertyMapping, '', LAMBDA_START);
    this.propertyMapping = propertyMapping;
    this.editorStore = editorStore;
  }

  get lambdaId(): string {
    return buildSourceInformationSourceId(
      [
        this.propertyMapping.owner.parent.path,
        SOURCE_ID_LABEL.PURE_INSTANCE_CLASS_MAPPING,
        this.propertyMapping.owner.id.value,
        this.propertyMapping.property.value.name,
        this.propertyMapping.targetSetImplementation?.id.value,
        this.uuid, // in case of duplications
      ].filter(isNonNullable),
    );
  }

  *convertLambdaGrammarStringToObject(): GeneratorFn<void> {
    const emptyLambda = RawLambda.createStub();
    if (this.lambdaString) {
      try {
        const lambda =
          (yield this.editorStore.graphState.graphManager.pureCodeToLambda(
            this.fullLambdaString,
            this.lambdaId,
          )) as RawLambda | undefined;
        this.setParserError(undefined);
        this.propertyMapping.transform = lambda ?? emptyLambda;
      } catch (error: unknown) {
        if (error instanceof ParserError) {
          this.setParserError(error);
        }
        this.editorStore.applicationStore.logger.error(
          CORE_LOG_EVENT.PARSING_PROBLEM,
          error,
        );
      }
    } else {
      this.clearErrors();
      this.propertyMapping.transform = emptyLambda;
    }
  }

  *convertLambdaObjectToGrammarString(pretty: boolean): GeneratorFn<void> {
    if (!this.propertyMapping.transform.isStub) {
      try {
        const lambdas = new Map<string, RawLambda>();
        lambdas.set(this.lambdaId, this.propertyMapping.transform);
        const isolatedLambdas =
          (yield this.editorStore.graphState.graphManager.lambdasToPureCode(
            lambdas,
            pretty,
          )) as Map<string, string>;
        const grammarText = isolatedLambdas.get(this.lambdaId);
        this.setLambdaString(
          grammarText !== undefined
            ? this.extractLambdaString(grammarText)
            : '',
        );
        this.clearErrors();
      } catch (error: unknown) {
        this.editorStore.applicationStore.logger.error(
          CORE_LOG_EVENT.PARSING_PROBLEM,
          error,
        );
      }
    } else {
      this.clearErrors();
      this.setLambdaString('');
    }
  }
}

export class PureInstanceSetImplementationState extends InstanceSetImplementationState {
  declare mappingElement: PureInstanceSetImplementation;
  declare propertyMappingStates: PurePropertyMappingState[];
  isConvertingTransformLambdaObjects = false;

  constructor(
    editorStore: EditorStore,
    setImplementation: PureInstanceSetImplementation,
  ) {
    super(editorStore, setImplementation);

    makeObservable(this, {
      isConvertingTransformLambdaObjects: observable,
      hasParserError: computed,
      setPropertyMappingStates: action,
    });

    this.mappingElement = setImplementation;
    this.propertyMappingStates = setImplementation.propertyMappings.map(
      (pm) => new PurePropertyMappingState(this.editorStore, this, pm),
    );
  }

  get hasParserError(): boolean {
    return this.propertyMappingStates.some(
      (propertyMappingState) => propertyMappingState.parserError,
    );
  }
  setPropertyMappingStates(
    propertyMappingState: PurePropertyMappingState[],
  ): void {
    this.propertyMappingStates = propertyMappingState;
  }

  /**
   * When we decorate, we might lose the error (parser/compiler) on each of the property mapping state
   * so here we make sure that we reuse existing state and only add new decorated ones
   */
  decorate(): void {
    this.mappingElement.accept_SetImplementationVisitor(
      new MappingElementDecorator(),
    );
    const newPropertyMappingStates: PurePropertyMappingState[] = [];
    const propertyMappingstatesAfterDecoration =
      this.mappingElement.propertyMappings.map(
        (pm) => new PurePropertyMappingState(this.editorStore, this, pm),
      );
    propertyMappingstatesAfterDecoration.forEach((propertyMappingState) => {
      const existingPropertyMappingState = this.propertyMappingStates.find(
        (p) => p.propertyMapping === propertyMappingState.propertyMapping,
      );
      newPropertyMappingStates.push(
        existingPropertyMappingState ?? propertyMappingState,
      );
    });
    this.setPropertyMappingStates(newPropertyMappingStates);
  }

  *convertPropertyMappingTransformObjects(): GeneratorFn<void> {
    const lambdas = new Map<string, RawLambda>();
    const propertyMappingsMap = new Map<string, PurePropertyMappingState>();
    this.propertyMappingStates.forEach((pm) => {
      if (!pm.propertyMapping.transform.isStub) {
        lambdas.set(pm.lambdaId, pm.propertyMapping.transform);
        propertyMappingsMap.set(pm.lambdaId, pm);
      }
    });
    if (lambdas.size) {
      this.isConvertingTransformLambdaObjects = true;
      try {
        const isolatedLambdas =
          (yield this.editorStore.graphState.graphManager.lambdasToPureCode(
            lambdas,
          )) as Map<string, string>;
        isolatedLambdas.forEach((grammarText, key) => {
          const purePropertyMapping = propertyMappingsMap.get(key);
          purePropertyMapping?.setLambdaString(
            purePropertyMapping.extractLambdaString(grammarText),
          );
        });
      } catch (error: unknown) {
        this.editorStore.applicationStore.logger.error(
          CORE_LOG_EVENT.PARSING_PROBLEM,
          error,
        );
      } finally {
        this.isConvertingTransformLambdaObjects = false;
      }
    }
  }
}
