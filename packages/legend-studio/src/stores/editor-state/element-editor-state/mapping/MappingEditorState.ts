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

import {
  observable,
  action,
  computed,
  flow,
  makeObservable,
  flowResult,
} from 'mobx';
import { CORE_LOG_EVENT } from '../../../../utils/Logger';
import { PRIMITIVE_TYPE } from '../../../../models/MetaModelConst';
import type { EditorStore } from '../../../EditorStore';
import {
  InstanceSetImplementationState,
  MappingElementState,
} from './MappingElementState';
import { PureInstanceSetImplementationState } from './PureInstanceSetImplementationState';
import { ElementEditorState } from '../../../editor-state/element-editor-state/ElementEditorState';
import {
  MAPPING_TEST_EDITOR_TAB_TYPE,
  MappingTestState,
  TEST_RESULT,
} from './MappingTestState';
import { createMockDataForMappingElementSource } from '../../../shared/MockDataUtil';
import { fromElementPathToMappingElementId } from '../../../../models/MetaModelUtils';
import type { GeneratorFn } from '@finos/legend-studio-shared';
import {
  generateEnumerableNameFromToken,
  IllegalStateError,
  isNonNullable,
  assertNonNullable,
  guaranteeNonNullable,
  guaranteeType,
  UnsupportedOperationError,
  assertTrue,
  addUniqueEntry,
} from '@finos/legend-studio-shared';
import { MappingExecutionState } from './MappingExecutionState';
import {
  FlatDataInstanceSetImplementationState,
  RootFlatDataInstanceSetImplementationState,
} from './FlatDataInstanceSetImplementationState';
import type { TreeNodeData, TreeData } from '@finos/legend-studio-components';
import { UnsupportedInstanceSetImplementationState } from './UnsupportedInstanceSetImplementationState';
import type { CompilationError } from '../../../../models/metamodels/pure/action/EngineError';
import { extractSourceInformationCoordinates } from '../../../../models/metamodels/pure/action/SourceInformationHelper';
import { Class } from '../../../../models/metamodels/pure/model/packageableElements/domain/Class';
import { Enumeration } from '../../../../models/metamodels/pure/model/packageableElements/domain/Enumeration';
import type {
  MappingElement,
  MappingElementSource,
} from '../../../../models/metamodels/pure/model/packageableElements/mapping/Mapping';
import {
  Mapping,
  MAPPING_ELEMENT_TYPE,
  getMappingElementType,
  getMappingElementTarget,
  getMappingElementSource,
} from '../../../../models/metamodels/pure/model/packageableElements/mapping/Mapping';
import type { EnumerationMapping } from '../../../../models/metamodels/pure/model/packageableElements/mapping/EnumerationMapping';
import type { SetImplementation } from '../../../../models/metamodels/pure/model/packageableElements/mapping/SetImplementation';
import { PureInstanceSetImplementation } from '../../../../models/metamodels/pure/model/packageableElements/store/modelToModel/mapping/PureInstanceSetImplementation';
import type { PackageableElement } from '../../../../models/metamodels/pure/model/packageableElements/PackageableElement';
import { MappingTest } from '../../../../models/metamodels/pure/model/packageableElements/mapping/MappingTest';
import { ExpectedOutputMappingTestAssert } from '../../../../models/metamodels/pure/model/packageableElements/mapping/ExpectedOutputMappingTestAssert';
import {
  ObjectInputData,
  ObjectInputType,
} from '../../../../models/metamodels/pure/model/packageableElements/store/modelToModel/mapping/ObjectInputData';
import { FlatDataInstanceSetImplementation } from '../../../../models/metamodels/pure/model/packageableElements/store/flatData/mapping/FlatDataInstanceSetImplementation';
import type { InstanceSetImplementation } from '../../../../models/metamodels/pure/model/packageableElements/mapping/InstanceSetImplementation';
import { EmbeddedFlatDataPropertyMapping } from '../../../../models/metamodels/pure/model/packageableElements/store/flatData/mapping/EmbeddedFlatDataPropertyMapping';
import type { AbstractFlatDataPropertyMapping } from '../../../../models/metamodels/pure/model/packageableElements/store/flatData/mapping/AbstractFlatDataPropertyMapping';
import type { InputData } from '../../../../models/metamodels/pure/model/packageableElements/mapping/InputData';
import { FlatDataInputData } from '../../../../models/metamodels/pure/model/packageableElements/store/flatData/mapping/FlatDataInputData';
import { RootFlatDataRecordType } from '../../../../models/metamodels/pure/model/packageableElements/store/flatData/model/FlatDataDataType';
import {
  PackageableElementExplicitReference,
  OptionalPackageableElementExplicitReference,
} from '../../../../models/metamodels/pure/model/packageableElements/PackageableElementReference';
import { RootFlatDataRecordTypeExplicitReference } from '../../../../models/metamodels/pure/model/packageableElements/store/flatData/model/RootFlatDataRecordTypeReference';
import { RootRelationalInstanceSetImplementation } from '../../../../models/metamodels/pure/model/packageableElements/store/relational/mapping/RootRelationalInstanceSetImplementation';
import { EmbeddedRelationalInstanceSetImplementation } from '../../../../models/metamodels/pure/model/packageableElements/store/relational/mapping/EmbeddedRelationalInstanceSetImplementation';
import { AggregationAwareSetImplementation } from '../../../../models/metamodels/pure/model/packageableElements/mapping/aggregationAware/AggregationAwareSetImplementation';
import { RootRelationalInstanceSetImplementationState } from './relational/RelationalInstanceSetImplementationState';
import { Table } from '../../../../models/metamodels/pure/model/packageableElements/store/relational/model/Table';
import { View } from '../../../../models/metamodels/pure/model/packageableElements/store/relational/model/View';
import { TableAlias } from '../../../../models/metamodels/pure/model/packageableElements/store/relational/model/RelationalOperationElement';
import { TableExplicitReference } from '../../../../models/metamodels/pure/model/packageableElements/store/relational/model/TableReference';
import { ViewExplicitReference } from '../../../../models/metamodels/pure/model/packageableElements/store/relational/model/ViewReference';
import {
  RelationalInputData,
  RelationalInputType,
} from '../../../../models/metamodels/pure/model/packageableElements/store/relational/mapping/RelationalInputData';
import { OperationSetImplementation } from '../../../../models/metamodels/pure/model/packageableElements/mapping/OperationSetImplementation';
import { LambdaEditorState } from '../LambdaEditorState';
import { AssociationImplementation } from '../../../../models/metamodels/pure/model/packageableElements/mapping/AssociationImplementation';

export interface MappingExplorerTreeNodeData extends TreeNodeData {
  mappingElement: MappingElement;
}

export const generateMappingTestName = (mapping: Mapping): string => {
  const generatedName = generateEnumerableNameFromToken(
    mapping.tests.map((test) => test.name),
    'test',
  );
  assertTrue(
    !mapping.tests.find((test) => test.name === generatedName),
    `Can't auto-generate test name for value '${generatedName}'`,
  );
  return generatedName;
};

const constructMappingElementNodeData = (
  mappingElement: MappingElement,
): MappingExplorerTreeNodeData => ({
  id: `${mappingElement.id.value}`,
  mappingElement: mappingElement,
  label: mappingElement.label.value,
});

const getMappingElementTreeNodeData = (
  mappingElement: MappingElement,
): MappingExplorerTreeNodeData => {
  const nodeData: MappingExplorerTreeNodeData =
    constructMappingElementNodeData(mappingElement);
  if (
    mappingElement instanceof FlatDataInstanceSetImplementation ||
    mappingElement instanceof EmbeddedFlatDataPropertyMapping
  ) {
    const embedded = mappingElement.propertyMappings.filter(
      (
        me: AbstractFlatDataPropertyMapping,
      ): me is EmbeddedFlatDataPropertyMapping =>
        me instanceof EmbeddedFlatDataPropertyMapping,
    );
    nodeData.childrenIds = embedded.map(
      (e) => `${nodeData.id}.${e.property.value.name}`,
    );
  }
  return nodeData;
};

const getMappingIdentitySortString = (
  me: MappingElement,
  type: PackageableElement,
): string => `${type.name}-${type.path}-${me.id.value}`;

const getMappingElementTreeData = (
  mapping: Mapping,
): TreeData<MappingExplorerTreeNodeData> => {
  const rootIds: string[] = [];
  const nodes = new Map<string, MappingExplorerTreeNodeData>();
  const rootMappingElements = mapping
    .getAllMappingElements()
    .sort((a, b) =>
      getMappingIdentitySortString(a, getMappingElementTarget(a)).localeCompare(
        getMappingIdentitySortString(b, getMappingElementTarget(b)),
      ),
    );
  rootMappingElements.forEach((mappingElement) => {
    const mappingElementTreeNodeData =
      getMappingElementTreeNodeData(mappingElement);
    addUniqueEntry(rootIds, mappingElementTreeNodeData.id);
    nodes.set(mappingElementTreeNodeData.id, mappingElementTreeNodeData);
  });
  return { rootIds, nodes };
};

const reprocessMappingElement = (
  mappingElement: MappingElement,
  treeNodes: Map<string, MappingExplorerTreeNodeData>,
  openNodes: string[],
): MappingExplorerTreeNodeData => {
  const nodeData: MappingExplorerTreeNodeData =
    constructMappingElementNodeData(mappingElement);
  if (
    mappingElement instanceof FlatDataInstanceSetImplementation ||
    mappingElement instanceof EmbeddedFlatDataPropertyMapping
  ) {
    const embedded = mappingElement.propertyMappings.filter(
      (
        me: AbstractFlatDataPropertyMapping,
      ): me is AbstractFlatDataPropertyMapping =>
        me instanceof EmbeddedFlatDataPropertyMapping,
    );
    nodeData.childrenIds = embedded.map(
      (e) => `${nodeData.id}.${e.property.value.name}`,
    );
    if (openNodes.includes(mappingElement.id.value)) {
      nodeData.isOpen = true;
      embedded.forEach((e) =>
        reprocessMappingElement(
          e as EmbeddedFlatDataPropertyMapping,
          treeNodes,
          openNodes,
        ),
      );
    }
  }
  treeNodes.set(nodeData.id, nodeData);
  return nodeData;
};

const reprocessMappingElementNodes = (
  mapping: Mapping,
  openNodes: string[],
): TreeData<MappingExplorerTreeNodeData> => {
  const rootIds: string[] = [];
  const nodes = new Map<string, MappingExplorerTreeNodeData>();
  const rootMappingElements = mapping
    .getAllMappingElements()
    .sort((a, b) =>
      getMappingIdentitySortString(a, getMappingElementTarget(a)).localeCompare(
        getMappingIdentitySortString(b, getMappingElementTarget(b)),
      ),
    );
  rootMappingElements.forEach((mappingElement) => {
    const mappingElementTreeNodeData = reprocessMappingElement(
      mappingElement,
      nodes,
      openNodes,
    );
    addUniqueEntry(rootIds, mappingElementTreeNodeData.id);
  });
  return { rootIds, nodes };
};

export interface MappingElementSpec {
  showTarget: boolean;
  // whether or not to open the new mapping element tab as an adjacent tab, this behavior is similar to Chrome
  openInAdjacentTab: boolean;
  target?: PackageableElement;
  postSubmitAction?: (newMappingElement: MappingElement | undefined) => void;
}

export type MappingEditorTabState =
  | MappingElementState
  | MappingTestState
  | MappingExecutionState;

export class MappingEditorState extends ElementEditorState {
  currentTabState?: MappingEditorTabState;
  openedTabStates: MappingEditorTabState[] = [];

  mappingExplorerTreeData: TreeData<MappingExplorerTreeNodeData>;
  newMappingElementSpec?: MappingElementSpec;

  mappingTestStates: MappingTestState[] = [];
  isRunningAllTests = false;
  allTestRunTime = 0;

  constructor(editorStore: EditorStore, element: PackageableElement) {
    super(editorStore, element);

    makeObservable<MappingEditorState, 'closeMappingElementTabState'>(this, {
      currentTabState: observable,
      openedTabStates: observable,
      mappingTestStates: observable,
      newMappingElementSpec: observable,
      isRunningAllTests: observable,
      allTestRunTime: observable,
      mappingExplorerTreeData: observable.ref,
      mapping: computed,
      testSuiteResult: computed,
      hasCompilationError: computed,
      setNewMappingElementSpec: action,
      setMappingExplorerTreeNodeData: action,
      openMappingElement: action,
      closeAllTabs: action,
      createMappingElement: action,
      reprocessMappingExplorerTree: action,
      mappingElementsWithSimilarTarget: computed,
      reprocess: action,
      openTab: flow,
      closeTab: flow,
      closeAllOtherTabs: flow,
      openTest: flow,
      buildExecution: flow,
      addTest: flow,
      deleteTest: flow,
      createNewTest: flow,
      runTests: flow,
      changeClassMappingSourceDriver: flow,
      closeMappingElementTabState: flow,
      deleteMappingElement: flow,
    });

    this.editorStore = editorStore;
    this.mappingTestStates = this.mapping.tests.map(
      (test) => new MappingTestState(editorStore, test, this),
    );
    this.mappingExplorerTreeData = getMappingElementTreeData(this.mapping);
  }

  get mapping(): Mapping {
    return guaranteeType(
      this.element,
      Mapping,
      'Element inside mapping editor state must be a mapping',
    );
  }

  /**
   * This method is used to check if a target is being mapped multiple times, so we can make
   * decision on things like whether we enforce the user to provide an ID for those mapping elements.
   */
  get mappingElementsWithSimilarTarget(): MappingElement[] {
    if (this.currentTabState instanceof MappingElementState) {
      const mappingElement = this.currentTabState.mappingElement;
      switch (getMappingElementType(mappingElement)) {
        case MAPPING_ELEMENT_TYPE.CLASS:
          return this.mapping.classMappings.filter(
            (cm) =>
              cm.class.value ===
              (mappingElement as SetImplementation).class.value,
          );
        case MAPPING_ELEMENT_TYPE.ENUMERATION:
          return this.mapping.enumerationMappings.filter(
            (em) =>
              em.enumeration.value ===
              (mappingElement as EnumerationMapping).enumeration.value,
          );
        case MAPPING_ELEMENT_TYPE.ASSOCIATION: // NOTE: we might not even support Association Mapping
        default:
          return [];
      }
    }
    return [];
  }

  setNewMappingElementSpec(spec: MappingElementSpec | undefined): void {
    this.newMappingElementSpec = spec;
  }

  // -------------------------------------- Tabs ---------------------------------------

  *openTab(tabState: MappingEditorTabState): GeneratorFn<void> {
    if (tabState !== this.currentTabState) {
      if (tabState instanceof MappingTestState) {
        yield flowResult(this.openTest(tabState.test));
      } else if (tabState instanceof MappingElementState) {
        this.openMappingElement(tabState.mappingElement, false);
      } else if (tabState instanceof MappingExecutionState) {
        this.currentTabState = tabState;
      }
    }
  }

  *closeTab(tabState: MappingEditorTabState): GeneratorFn<void> {
    const tabIndex = this.openedTabStates.findIndex((ts) => ts === tabState);
    assertTrue(
      tabIndex !== -1,
      `Mapping editor tab should be currently opened`,
    );
    this.openedTabStates.splice(tabIndex, 1);
    // if current tab is closed, we need further processing
    if (this.currentTabState === tabState) {
      if (this.openedTabStates.length) {
        const openIndex = tabIndex - 1;
        const tabStateToOpen =
          openIndex >= 0
            ? this.openedTabStates[openIndex]
            : this.openedTabStates.length
            ? this.openedTabStates[0]
            : undefined;
        if (tabStateToOpen) {
          yield flowResult(this.openTab(tabStateToOpen));
        } else {
          this.currentTabState = undefined;
        }
      } else {
        this.currentTabState = undefined;
      }
    }
  }

  *closeAllOtherTabs(tabState: MappingEditorTabState): GeneratorFn<void> {
    assertNonNullable(
      this.openedTabStates.find((ts) => ts === tabState),
      `Mapping editor tab should be currently opened`,
    );
    this.openedTabStates = [tabState];
    yield flowResult(this.openTab(tabState));
  }

  closeAllTabs(): void {
    this.currentTabState = undefined;
    this.openedTabStates = [];
  }

  // -------------------------------------- Explorer Tree ---------------------------------------

  setMappingExplorerTreeNodeData(
    data: TreeData<MappingExplorerTreeNodeData>,
  ): void {
    this.mappingExplorerTreeData = data;
  }

  onMappingExplorerTreeNodeExpand = (
    node: MappingExplorerTreeNodeData,
  ): void => {
    const mappingElement = node.mappingElement;
    const treeData = this.mappingExplorerTreeData;
    if (node.childrenIds?.length) {
      node.isOpen = !node.isOpen;
      if (
        mappingElement instanceof FlatDataInstanceSetImplementation ||
        mappingElement instanceof EmbeddedFlatDataPropertyMapping
      ) {
        mappingElement.propertyMappings
          .filter(
            (
              me: AbstractFlatDataPropertyMapping,
            ): me is EmbeddedFlatDataPropertyMapping =>
              me instanceof EmbeddedFlatDataPropertyMapping,
          )
          .forEach((embeddedPM) => {
            const embeddedPropertyNode =
              getMappingElementTreeNodeData(embeddedPM);
            treeData.nodes.set(embeddedPropertyNode.id, embeddedPropertyNode);
          });
      }
    }
    this.setMappingExplorerTreeNodeData({ ...treeData });
  };

  onMappingExplorerTreeNodeSelect = (
    node: MappingExplorerTreeNodeData,
  ): void => {
    this.onMappingExplorerTreeNodeExpand(node);
    this.openMappingElement(node.mappingElement, false);
  };

  getMappingExplorerTreeChildNodes = (
    node: MappingExplorerTreeNodeData,
  ): MappingExplorerTreeNodeData[] => {
    if (!node.childrenIds) {
      return [];
    }
    const childrenNodes = node.childrenIds
      .map((id) => this.mappingExplorerTreeData.nodes.get(id))
      .filter(isNonNullable)
      .sort((a, b) => a.label.localeCompare(b.label));
    return childrenNodes;
  };

  reprocessMappingExplorerTree(openNodeFoCurrentTab = false): void {
    const openedTreeNodeIds = Array.from(
      this.mappingExplorerTreeData.nodes.values(),
    )
      .filter((node) => node.isOpen)
      .map((node) => node.id);
    this.setMappingExplorerTreeNodeData(
      reprocessMappingElementNodes(this.mapping, openedTreeNodeIds),
    );
    if (openNodeFoCurrentTab) {
      // FIXME: we should follow the example of project explorer where we maintain the currentlySelectedNode
      // instead of adaptively show the `selectedNode` based on current tab state. This is bad
      // this.setMappingElementTreeNodeData(openNode(openElement, this.mappingElementsTreeData));
      // const openNode = (element: EmbeddedFlatDataPropertyMapping, treeData: TreeData<MappingElementTreeNodeData>): MappingElementTreeNodeData => {
      // if (element instanceof EmbeddedFlatDataPropertyMapping) {
      //   let currentElement: InstanceSetImplementation | undefined = element;
      //   while (currentElement instanceof EmbeddedFlatDataPropertyMapping) {
      //     const node: MappingElementTreeNodeData = treeData.nodes.get(currentElement.id) ?? addNode(currentElement, treeData);
      //     node.isOpen = true;
      //     currentElement = currentElement.owner as InstanceSetImplementation;
      //   }
      //   // create children if not created
      //   element.propertyMappings.filter((me: AbstractFlatDataPropertyMapping): me is EmbeddedFlatDataPropertyMapping => me instanceof EmbeddedFlatDataPropertyMapping)
      //     .forEach(el => treeData.nodes.get(el.id) ?? addNode(el, treeData));
      // }
      // return treeData;
      // const addNode = (element: EmbeddedFlatDataPropertyMapping, treeData: TreeData<MappingElementTreeNodeData>): MappingElementTreeNodeData => {
      //   const newNode = getMappingElementTreeNodeData(element);
      //   treeData.nodes.set(newNode.id, newNode);
      //   if (element.owner instanceof FlatDataInstanceSetImplementation || element.owner instanceof EmbeddedFlatDataPropertyMapping) {
      //     const baseNode = treeData.nodes.get(element.owner.id);
      //     if (baseNode) {
      //       baseNode.isOpen = true;
      //     }
      //   } else {
      //     const parentNode = treeData.nodes.get(element.owner.id);
      //     if (parentNode) {
      //       parentNode.childrenIds = parentNode.childrenIds ? Array.from((new Set(parentNode.childrenIds)).add(newNode.id)) : [newNode.id];
      //     }
      //   }
      //   return newNode;
      // };
    }
  }

  // -------------------------------------- Mapping Element ---------------------------------------

  openMappingElement(
    mappingElement: MappingElement,
    openInAdjacentTab: boolean,
  ): void {
    if (mappingElement instanceof AssociationImplementation) {
      this.editorStore.applicationStore.notifyUnsupportedFeature(
        'Association mapping editor',
      );
      return;
    }
    // If the next mapping element to be opened is not opened yet, we will find the right place to put it in the tab bar
    if (
      !this.openedTabStates.find(
        (tabState) =>
          tabState instanceof MappingElementState &&
          tabState.mappingElement === mappingElement,
      )
    ) {
      const newMappingElementState = guaranteeNonNullable(
        this.createMappingElementState(mappingElement),
      );
      if (openInAdjacentTab) {
        const currentMappingElementIndex = this.openedTabStates.findIndex(
          (tabState) => tabState === this.currentTabState,
        );
        if (currentMappingElementIndex !== -1) {
          this.openedTabStates.splice(
            currentMappingElementIndex + 1,
            0,
            newMappingElementState,
          );
        } else {
          throw new IllegalStateError(`Can't find current mapping editor tab`);
        }
      } else {
        this.openedTabStates.push(newMappingElementState);
      }
    }
    // Set current mapping element, i.e. switch to new tab
    this.currentTabState = this.openedTabStates.find(
      (tabState) =>
        tabState instanceof MappingElementState &&
        tabState.mappingElement === mappingElement,
    );
    this.reprocessMappingExplorerTree(true);
  }

  /* @MARKER: NEW CLASS MAPPING TYPE SUPPORT --- consider adding class mapping type handler here whenever support for a new one is added to the app */
  *changeClassMappingSourceDriver(
    setImplementation: InstanceSetImplementation,
    newSource: MappingElementSource | undefined,
  ): GeneratorFn<void> {
    const currentSource = getMappingElementSource(setImplementation);
    if (currentSource !== newSource) {
      if (
        setImplementation instanceof PureInstanceSetImplementation &&
        (newSource instanceof Class || newSource === undefined)
      ) {
        setImplementation.setSrcClass(newSource);
      } else if (
        setImplementation instanceof FlatDataInstanceSetImplementation &&
        newSource instanceof RootFlatDataRecordType &&
        !setImplementation.getEmbeddedSetImplmentations().length
      ) {
        setImplementation.setSourceRootRecordType(newSource);
      } else {
        // here we require a change of set implementation as the source type does not match the what the current class mapping supports
        let newSetImp: InstanceSetImplementation;
        if (newSource instanceof RootFlatDataRecordType) {
          newSetImp = new FlatDataInstanceSetImplementation(
            setImplementation.id,
            this.mapping,
            PackageableElementExplicitReference.create(
              setImplementation.class.value,
            ),
            setImplementation.root,
            RootFlatDataRecordTypeExplicitReference.create(newSource),
          );
        } else if (newSource instanceof Class || newSource === undefined) {
          newSetImp = new PureInstanceSetImplementation(
            setImplementation.id,
            this.mapping,
            setImplementation.class,
            setImplementation.root,
            OptionalPackageableElementExplicitReference.create(newSource),
          );
        } else if (newSource instanceof Table || newSource instanceof View) {
          const newRootRelationalInstanceSetImplementation =
            new RootRelationalInstanceSetImplementation(
              setImplementation.id,
              this.mapping,
              setImplementation.class,
              setImplementation.root,
            );
          const mainTableAlias = new TableAlias();
          mainTableAlias.relation =
            newSource instanceof Table
              ? TableExplicitReference.create(newSource)
              : ViewExplicitReference.create(newSource);
          mainTableAlias.name = mainTableAlias.relation.value.name;
          newRootRelationalInstanceSetImplementation.mainTableAlias =
            mainTableAlias;
          newSetImp = newRootRelationalInstanceSetImplementation;
        } else {
          throw new UnsupportedOperationError(
            `Can't use the specified class mapping source`,
            newSource,
          );
        }

        // replace the instance set implementation in mapping
        const idx = guaranteeNonNullable(
          this.mapping.classMappings.findIndex(
            (classMapping) => classMapping === setImplementation,
          ),
          `Can't find class mapping with ID '${setImplementation.id.value}' in mapping '${this.mapping.path}'`,
        );
        this.mapping.classMappings[idx] = newSetImp;

        // replace the instance set implementation in opened tab state
        const setImplStateIdx = guaranteeNonNullable(
          this.openedTabStates.findIndex(
            (tabState) =>
              tabState instanceof MappingElementState &&
              tabState.mappingElement === setImplementation,
          ),
          `Can't find any mapping state for class mapping with ID '${setImplementation.id.value}'`,
        );
        const newMappingElementState = guaranteeNonNullable(
          this.createMappingElementState(newSetImp),
        );
        this.openedTabStates[setImplStateIdx] = newMappingElementState;
        this.currentTabState = newMappingElementState;

        // close all children
        yield flowResult(this.closeMappingElementTabState(setImplementation));
        this.reprocessMappingExplorerTree(true);
      }
    }
  }

  private *closeMappingElementTabState(
    mappingElement: MappingElement,
  ): GeneratorFn<void> {
    let mappingElementsToClose = [mappingElement];
    if (
      this.editorStore.graphState.isInstanceSetImplementation(mappingElement)
    ) {
      const embeddedChildren = mappingElement.getEmbeddedSetImplmentations();
      mappingElementsToClose = mappingElementsToClose.concat(embeddedChildren);
    }
    const matchMappingElementState = (
      tabState: MappingEditorTabState | undefined,
    ): boolean =>
      tabState instanceof MappingElementState &&
      mappingElementsToClose.includes(tabState.mappingElement);
    if (
      this.currentTabState &&
      matchMappingElementState(this.currentTabState)
    ) {
      yield flowResult(this.closeTab(this.currentTabState));
    }
    this.openedTabStates = this.openedTabStates.filter(
      (tabState) => !matchMappingElementState(tabState),
    );
  }

  *deleteMappingElement(mappingElement: MappingElement): GeneratorFn<void> {
    yield flowResult(this.mapping.deleteMappingElement(mappingElement));
    yield flowResult(this.closeMappingElementTabState(mappingElement));
    this.reprocessMappingExplorerTree();
  }

  /**
   * This will determine if we need to show the new mapping element modal or not
   */
  createMappingElement(spec: MappingElementSpec): void {
    if (spec.target) {
      const suggestedId = fromElementPathToMappingElementId(spec.target.path);
      const mappingIds = this.mapping
        .getAllMappingElements()
        .map((mElement) => mElement.id.value);
      const showId = mappingIds.includes(suggestedId);
      const showClasMappingType = spec.target instanceof Class;
      const showNewMappingModal = [
        showId,
        spec.showTarget,
        showClasMappingType,
      ].some(Boolean);
      if (showNewMappingModal) {
        this.setNewMappingElementSpec(spec);
      } else {
        let newMappingElement: MappingElement | undefined = undefined;
        if (spec.target instanceof Enumeration) {
          // We default to a source type of String when creating a new enumeration mapping
          newMappingElement = this.mapping.createEnumerationMapping(
            suggestedId,
            spec.target,
            this.editorStore.graphState.graph.getPrimitiveType(
              PRIMITIVE_TYPE.STRING,
            ),
          );
        }
        // NOTE: we don't support association now, nor do we support this for class
        // since class requires a step to choose the class mapping type
        if (newMappingElement) {
          this.openMappingElement(newMappingElement, true);
        }
        if (spec.postSubmitAction) {
          spec.postSubmitAction(newMappingElement);
        }
      }
    } else {
      this.setNewMappingElementSpec(spec);
    }
  }

  /* @MARKER: NEW CLASS MAPPING TYPE SUPPORT --- consider adding class mapping type handler here whenever support for a new one is added to the app */
  private createMappingElementState(
    mappingElement: MappingElement | undefined,
  ): MappingElementState | undefined {
    if (!mappingElement) {
      return undefined;
    }
    if (mappingElement instanceof PureInstanceSetImplementation) {
      return new PureInstanceSetImplementationState(
        this.editorStore,
        mappingElement,
      );
    } else if (mappingElement instanceof FlatDataInstanceSetImplementation) {
      return new RootFlatDataInstanceSetImplementationState(
        this.editorStore,
        mappingElement,
      );
    } else if (mappingElement instanceof EmbeddedFlatDataPropertyMapping) {
      throw new UnsupportedOperationError(
        `Can't create mapping element state for emebdded property mapping`,
      );
    } else if (
      mappingElement instanceof RootRelationalInstanceSetImplementation
    ) {
      return new RootRelationalInstanceSetImplementationState(
        this.editorStore,
        mappingElement,
      );
    } else if (
      mappingElement instanceof EmbeddedRelationalInstanceSetImplementation ||
      mappingElement instanceof AggregationAwareSetImplementation
    ) {
      return new UnsupportedInstanceSetImplementationState(
        this.editorStore,
        mappingElement,
      );
    }
    return new MappingElementState(this.editorStore, mappingElement);
  }

  // -------------------------------------- Compilation ---------------------------------------

  reprocess(newElement: Mapping, editorStore: EditorStore): MappingEditorState {
    const mappingEditorState = new MappingEditorState(editorStore, newElement);

    // process tabs
    mappingEditorState.openedTabStates = this.openedTabStates
      .map((tabState) => {
        if (tabState instanceof MappingElementState) {
          const mappingElement =
            mappingEditorState.mapping.getMappingElementByTypeAndId(
              getMappingElementType(tabState.mappingElement),
              tabState.mappingElement.id.value,
            );
          return this.createMappingElementState(mappingElement);
        } else if (tabState instanceof MappingTestState) {
          return mappingEditorState.mappingTestStates.find(
            (testState) => testState.test.name === tabState.test.name,
          );
        } else if (tabState instanceof MappingExecutionState) {
          // TODO?: re-consider if we would want to reprocess mapping execution tabs or not
          return undefined;
        }
        // TODO?: re-consider if we would want to reprocess mapping execution tabs or not
        return undefined;
      })
      .filter(isNonNullable);

    // process currently opened tab
    if (this.currentTabState instanceof MappingElementState) {
      const currentlyOpenedMappingElement =
        mappingEditorState.mapping.getMappingElementByTypeAndId(
          getMappingElementType(this.currentTabState.mappingElement),
          this.currentTabState.mappingElement.id.value,
        );
      mappingEditorState.currentTabState = this.openedTabStates.find(
        (tabState) =>
          tabState instanceof MappingElementState &&
          tabState.mappingElement === currentlyOpenedMappingElement,
      );
    } else if (this.currentTabState instanceof MappingTestState) {
      const currentlyOpenedMappingTest =
        mappingEditorState.mappingTestStates.find(
          (testState) =>
            this.currentTabState instanceof MappingTestState &&
            testState.test.name === this.currentTabState.test.name,
        )?.test;
      mappingEditorState.currentTabState = this.openedTabStates.find(
        (tabState) =>
          tabState instanceof MappingTestState &&
          tabState.test === currentlyOpenedMappingTest,
      );
    } else {
      // TODO?: re-consider if we would want to reprocess mapping execution tab or not
      mappingEditorState.currentTabState = undefined;
    }

    return mappingEditorState;
  }

  /* @MARKER: NEW CLASS MAPPING TYPE SUPPORT --- consider adding class mapping type handler here whenever support for a new one is added to the app */
  override revealCompilationError(compilationError: CompilationError): boolean {
    let revealed = false;
    try {
      if (compilationError.sourceInformation) {
        const errorCoordinates = extractSourceInformationCoordinates(
          compilationError.sourceInformation,
        );
        if (errorCoordinates) {
          const sourceId = compilationError.sourceInformation.sourceId;
          assertTrue(errorCoordinates.length >= 5);
          const [, mappingType, mappingId, propertyName, targetPropertyId] =
            errorCoordinates;
          const newMappingElement = this.mapping.getMappingElementByTypeAndId(
            mappingType,
            mappingId,
          );
          // NOTE: Unfortunately this is quite convoluted at the moment that is because we maintain a separate state
          // that wraps around property mapping, this is deliberate as we don't want to mix UI state in metamodel classes
          // in the future if this gets bigger, we might need to move this out to `MappingElementState`
          if (
            newMappingElement instanceof PureInstanceSetImplementation ||
            newMappingElement instanceof FlatDataInstanceSetImplementation ||
            newMappingElement instanceof EmbeddedFlatDataPropertyMapping
          ) {
            const propertyMapping = newMappingElement.findPropertyMapping(
              propertyName,
              targetPropertyId,
            );
            if (propertyMapping) {
              if (
                !(this.currentTabState instanceof MappingElementState) ||
                newMappingElement !== this.currentTabState.mappingElement
              ) {
                this.openMappingElement(newMappingElement, false);
              }
              if (
                this.currentTabState instanceof
                  PureInstanceSetImplementationState ||
                this.currentTabState instanceof
                  FlatDataInstanceSetImplementationState
              ) {
                const propertyMappingState: LambdaEditorState | undefined = (
                  this.currentTabState.propertyMappingStates as unknown[]
                )
                  .filter(
                    (state): state is LambdaEditorState =>
                      state instanceof LambdaEditorState,
                  )
                  .find((state) => state.lambdaId === sourceId);
                if (propertyMappingState) {
                  propertyMappingState.setCompilationError(compilationError);
                  revealed = true;
                }
              } else {
                throw new IllegalStateError(
                  'Expected to have current mapping editor state to be of consistent type with current mapping element',
                );
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      this.editorStore.applicationStore.logger.warn(
        CORE_LOG_EVENT.COMPILATION_PROBLEM,
        `Can't locate error, redirecting to text mode`,
        error,
      );
    }
    return revealed;
  }

  override get hasCompilationError(): boolean {
    return this.openedTabStates
      .filter(
        (tabState): tabState is InstanceSetImplementationState =>
          tabState instanceof InstanceSetImplementationState,
      )
      .some((tabState) =>
        tabState.propertyMappingStates.some((pmState) =>
          Boolean(pmState.compilationError),
        ),
      );
  }

  override clearCompilationError(): void {
    this.openedTabStates
      .filter(
        (tabState): tabState is InstanceSetImplementationState =>
          tabState instanceof InstanceSetImplementationState,
      )
      .forEach((tabState) => {
        tabState.propertyMappingStates.forEach((pmState) =>
          pmState.setCompilationError(undefined),
        );
      });
  }

  // -------------------------------------- Execution ---------------------------------------

  *buildExecution(setImpl: SetImplementation): GeneratorFn<void> {
    const executionStateName = generateEnumerableNameFromToken(
      this.openedTabStates
        .filter(
          (tabState): tabState is MappingExecutionState =>
            tabState instanceof MappingExecutionState,
        )
        .map((tabState) => tabState.name),
      'execution',
    );
    assertTrue(
      !this.openedTabStates
        .filter(
          (tabState): tabState is MappingExecutionState =>
            tabState instanceof MappingExecutionState,
        )
        .find((tabState) => tabState.name === executionStateName),
      `Can't auto-generate execution name for value '${executionStateName}'`,
    );
    const executionState = new MappingExecutionState(
      this.editorStore,
      this,
      executionStateName,
    );
    yield flowResult(executionState.buildQueryWithClassMapping(setImpl));
    addUniqueEntry(this.openedTabStates, executionState);
    this.currentTabState = executionState;
  }

  // -------------------------------------- Test ---------------------------------------

  *openTest(
    test: MappingTest,
    openTab?: MAPPING_TEST_EDITOR_TAB_TYPE,
  ): GeneratorFn<void> {
    const isOpened = Boolean(
      this.openedTabStates.find(
        (tabState) =>
          tabState instanceof MappingTestState && tabState.test === test,
      ),
    );
    const testState = this.mappingTestStates.find(
      (mappingTestState) => mappingTestState.test === test,
    );
    assertNonNullable(
      testState,
      `Mapping test state must already been created for test '${test.name}'`,
    );
    if (
      !this.openedTabStates.find(
        (tabState) =>
          tabState instanceof MappingTestState && tabState.test === test,
      )
    ) {
      addUniqueEntry(this.openedTabStates, testState);
    }
    this.currentTabState = this.openedTabStates.find(
      (tabState) =>
        tabState instanceof MappingTestState && tabState.test === test,
    );
    yield flowResult(
      testState.onTestStateOpen(
        openTab ??
          // This is for user's convenience.
          // If the test is already opened, respect is currently opened tab
          // otherwise, if the test has a result, switch to show the result tab
          (!isOpened && testState.result !== TEST_RESULT.NONE
            ? MAPPING_TEST_EDITOR_TAB_TYPE.RESULT
            : undefined),
      ),
    );
  }

  get testSuiteResult(): TEST_RESULT {
    const numberOfTestPassed = this.mappingTestStates.filter(
      (testState) => testState.result === TEST_RESULT.PASSED,
    ).length;
    const numberOfTestFailed = this.mappingTestStates.filter(
      (testState) =>
        testState.result === TEST_RESULT.FAILED ||
        testState.result === TEST_RESULT.ERROR,
    ).length;
    return numberOfTestFailed
      ? TEST_RESULT.FAILED
      : numberOfTestPassed
      ? TEST_RESULT.PASSED
      : TEST_RESULT.NONE;
  }

  *runTests(): GeneratorFn<void> {
    const startTime = Date.now();
    this.isRunningAllTests = true;
    this.mappingTestStates.forEach((testState) =>
      testState.resetTestRunStatus(),
    );
    yield Promise.all(
      this.mappingTestStates.map((testState: MappingTestState) => {
        // run non-skip tests, and reset all skipped tests
        if (!testState.isSkipped) {
          return testState.runTest();
        }
        testState.resetTestRunStatus();
        return undefined;
      }),
    );
    this.isRunningAllTests = false;
    this.allTestRunTime = Date.now() - startTime;
  }

  *addTest(test: MappingTest): GeneratorFn<void> {
    this.mappingTestStates.push(
      new MappingTestState(this.editorStore, test, this),
    );
    this.mapping.addTest(test);
    yield flowResult(this.openTest(test));
  }

  *deleteTest(test: MappingTest): GeneratorFn<void> {
    const matchMappingTestState = (
      tabState: MappingEditorTabState | undefined,
    ): boolean =>
      tabState instanceof MappingTestState && tabState.test === test;
    this.mapping.deleteTest(test);
    if (this.currentTabState && matchMappingTestState(this.currentTabState)) {
      yield flowResult(this.closeTab(this.currentTabState));
    }
    this.openedTabStates = this.openedTabStates.filter(
      (tabState) => !matchMappingTestState(tabState),
    );
    this.mappingTestStates = this.mappingTestStates.filter(
      (tabState) => !matchMappingTestState(tabState),
    );
  }

  *createNewTest(setImplementation: SetImplementation): GeneratorFn<void> {
    const query =
      this.editorStore.graphState.graphManager.HACKY_createGetAllLambda(
        setImplementation.class.value,
      );
    const source = getMappingElementSource(setImplementation);
    if (setImplementation instanceof OperationSetImplementation) {
      this.editorStore.applicationStore.notifyWarning(
        `Can't auto-generate input data for operation class mapping. Please pick a concrete class mapping instead`,
      );
    }
    let inputData: InputData;
    if (source === undefined || source instanceof Class) {
      inputData = new ObjectInputData(
        PackageableElementExplicitReference.create(
          source ?? Class.createStub(),
        ),
        ObjectInputType.JSON,
        source
          ? createMockDataForMappingElementSource(source, this.editorStore)
          : '{}',
      );
    } else if (source instanceof RootFlatDataRecordType) {
      inputData = new FlatDataInputData(
        PackageableElementExplicitReference.create(source.owner.owner),
        createMockDataForMappingElementSource(source, this.editorStore),
      );
    } else if (source instanceof Table || source instanceof View) {
      inputData = new RelationalInputData(
        PackageableElementExplicitReference.create(source.schema.owner),
        createMockDataForMappingElementSource(source, this.editorStore),
        RelationalInputType.SQL,
      );
    } else {
      throw new UnsupportedOperationError(
        `Can't create new mapping test input data with the specified source`,
        source,
      );
    }
    const newTest = new MappingTest(
      generateMappingTestName(this.mapping),
      query,
      [inputData],
      new ExpectedOutputMappingTestAssert('{}'),
    );
    this.mapping.addTest(newTest);
    // open the test
    this.mappingTestStates.push(
      new MappingTestState(this.editorStore, newTest, this),
    );
    yield flowResult(this.openTest(newTest));
  }
}
