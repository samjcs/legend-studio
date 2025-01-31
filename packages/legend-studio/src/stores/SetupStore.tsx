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

import { createContext, useContext } from 'react';
import { observable, action, makeAutoObservable, flowResult } from 'mobx';
import { CORE_LOG_EVENT } from '../utils/Logger';
import { useLocalObservable } from 'mobx-react-lite';
import type { ApplicationStore } from './ApplicationStore';
import { useApplicationStore } from './ApplicationStore';
import type { ProjectSelectOption } from '../models/sdlc/models/project/Project';
import {
  Project,
  ProjectType,
  ImportProjectReport,
} from '../models/sdlc/models/project/Project';
import type { WorkspaceSelectOption } from '../models/sdlc/models/workspace/Workspace';
import {
  Workspace,
  WORKSPACE_TYPE,
  PROJECT_LATEST_VIEWER_WORKSPACE,
} from '../models/sdlc/models/workspace/Workspace';
import type { GeneratorFn, PlainObject } from '@finos/legend-studio-shared';
import {
  ActionState,
  assertNonNullable,
  guaranteeNonNullable,
  compareLabelFn,
} from '@finos/legend-studio-shared';
import { Review } from '../models/sdlc/models/review/Review';
import { generateSetupRoute } from './LegendStudioRouter';

interface ImportProjectSuccessReport {
  projectId: string;
  projectName: string;
  reviewUrl: string;
}

export class SetupStore {
  applicationStore: ApplicationStore;
  currentProjectId?: string;
  currentWorkspaceId?: string;
  projects?: Map<string, Project>;
  workspacesByProject = new Map<string, Map<string, Workspace>>();
  loadWorkspacesState = ActionState.create();
  createWorkspaceState = ActionState.create();
  createOrImportProjectState = ActionState.create();
  loadProjectsState = ActionState.create();
  showCreateProjectModal = false;
  showCreateWorkspaceModal = false;
  importProjectSuccessReport?: ImportProjectSuccessReport;

  constructor(applicationStore: ApplicationStore) {
    makeAutoObservable(this, {
      applicationStore: false,
      setCreateProjectModal: action,
      setCreateWorkspaceModal: action,
      setCurrentProjectId: action,
      setCurrentWorkspaceId: action,
      setImportProjectSuccessReport: action,
    });

    this.applicationStore = applicationStore;
  }

  get currentProject(): Project | undefined {
    return this.projects && this.currentProjectId
      ? this.projects.get(this.currentProjectId)
      : undefined;
  }
  get currentProjectWorkspaces(): Map<string, Workspace> | undefined {
    return this.currentProjectId
      ? this.workspacesByProject.get(this.currentProjectId)
      : undefined;
  }
  get currentWorkspace(): Workspace | undefined {
    return this.currentProjectWorkspaces && this.currentWorkspaceId
      ? this.currentProjectWorkspaces.get(this.currentWorkspaceId)
      : undefined;
  }

  setCreateProjectModal(modal: boolean): void {
    this.showCreateProjectModal = modal;
  }
  setCreateWorkspaceModal(modal: boolean): void {
    this.showCreateWorkspaceModal = modal;
  }
  setCurrentProjectId(id: string | undefined): void {
    this.currentProjectId = id;
  }
  setCurrentWorkspaceId(id: string | undefined): void {
    this.currentWorkspaceId = id;
  }
  setImportProjectSuccessReport(
    importProjectSuccessReport: ImportProjectSuccessReport | undefined,
  ): void {
    this.importProjectSuccessReport = importProjectSuccessReport;
  }

  *fetchProjects(): GeneratorFn<void> {
    this.loadProjectsState.inProgress();
    try {
      const projects = (
        (yield Promise.all(
          [
            this.applicationStore.networkClientManager.sdlcClient.getProjects(
              ProjectType.PRODUCTION,
              undefined,
              undefined,
              undefined,
            ),
            this.applicationStore.networkClientManager.sdlcClient.getProjects(
              ProjectType.PROTOTYPE,
              undefined,
              undefined,
              undefined,
            ),
          ].map((promise, idx) =>
            promise.catch((error) => {
              const wrappedError = new Error(
                `Error fetching ${
                  idx === 0 ? ProjectType.PRODUCTION : ProjectType.PROTOTYPE
                } projects: ${error.message}`,
              );
              this.applicationStore.logger.error(
                CORE_LOG_EVENT.SETUP_PROBLEM,
                wrappedError,
              );
              this.applicationStore.notifyError(wrappedError);
              return [];
            }),
          ),
        )) as PlainObject<Project>[][]
      )
        .flat()
        .map((project) => Project.serialization.fromJson(project));
      const projectMap = observable<string, Project>(new Map());
      projects.forEach((project) => projectMap.set(project.projectId, project));
      this.projects = projectMap;
      this.loadProjectsState.pass();
    } catch (error: unknown) {
      this.applicationStore.logger.error(CORE_LOG_EVENT.SETUP_PROBLEM, error);
      this.applicationStore.notifyError(error);
      this.loadProjectsState.fail();
    }
  }

  /**
   * As of now we only create PROTOTYPE project since the creating PRODUCTION projects is not straight forward
   * we need to go to Gitlab, create a project there then associate that with SDLC server, etc.
   */
  *createProject(
    name: string,
    description: string,
    groupId: string,
    artifactId: string,
    tags: string[] = [],
  ): GeneratorFn<void> {
    this.createOrImportProjectState.inProgress();
    try {
      const createdProject = Project.serialization.fromJson(
        (yield this.applicationStore.networkClientManager.sdlcClient.createProject(
          {
            name,
            description,
            type: ProjectType.PROTOTYPE,
            groupId,
            artifactId,
            tags,
          },
        )) as PlainObject<Project>,
      );
      this.applicationStore.notifySuccess(
        `Project '${name}' is succesfully created`,
      );
      yield flowResult(this.fetchProjects());
      this.projects?.set(createdProject.projectId, createdProject);
      this.applicationStore.historyApiClient.push(
        generateSetupRoute(
          this.applicationStore.config.sdlcServerKey,
          createdProject.projectId,
        ),
      );
      this.setCreateProjectModal(false);
    } catch (error: unknown) {
      this.applicationStore.notifyError(error);
    } finally {
      this.createOrImportProjectState.reset();
    }
  }

  *importProject(
    id: string,
    groupId: string,
    artifactId: string,
  ): GeneratorFn<void> {
    this.createOrImportProjectState.inProgress();
    try {
      const report = ImportProjectReport.serialization.fromJson(
        (yield this.applicationStore.networkClientManager.sdlcClient.importProject(
          {
            id,
            type: ProjectType.PRODUCTION,
            groupId,
            artifactId,
          },
        )) as PlainObject<ImportProjectReport>,
      );
      const importReview = Review.serialization.fromJson(
        (yield this.applicationStore.networkClientManager.sdlcClient.getReview(
          report.project.projectId,
          report.reviewId,
        )) as PlainObject<Review>,
      );
      this.setImportProjectSuccessReport({
        projectName: report.project.name,
        projectId: report.project.projectId,
        reviewUrl: importReview.webURL,
      });
      yield flowResult(this.fetchProjects());
      this.projects?.set(report.project.projectId, report.project);
      this.setCurrentProjectId(report.project.projectId);
    } catch (error: unknown) {
      this.applicationStore.notifyError(error);
    } finally {
      this.createOrImportProjectState.reset();
    }
  }

  get projectOptions(): ProjectSelectOption[] {
    return this.projects
      ? Array.from(this.projects.values())
          .map((project) => {
            const option = project.selectOption;
            return {
              ...option,
              disabled:
                project.projectType === ProjectType.PROTOTYPE &&
                this.applicationStore.config.options
                  .TEMPORARY__useSDLCProductionProjectsOnly,
            };
          })
          .sort(compareLabelFn)
      : [];
  }

  get currentProjectWorkspaceOptions(): WorkspaceSelectOption[] {
    return this.currentProjectWorkspaces
      ? Array.from(this.currentProjectWorkspaces.values())
          .filter(
            (workspace) =>
              workspace.workspaceId !== PROJECT_LATEST_VIEWER_WORKSPACE,
          )
          .map((workspace) => workspace.selectOption)
          .sort(compareLabelFn)
      : [];
  }

  *fetchWorkspaces(projectId: string): GeneratorFn<void> {
    this.loadWorkspacesState.inProgress();
    try {
      const workspacesInConflictResolutionIds = (
        (yield this.applicationStore.networkClientManager.sdlcClient.getWorkspacesInConflictResolutionMode(
          projectId,
        )) as Workspace[]
      ).map((workspace) => workspace.workspaceId);
      const workspaceMap = observable<string, Workspace>(new Map());
      (
        (yield this.applicationStore.networkClientManager.sdlcClient.getWorkspaces(
          projectId,
        )) as PlainObject<Workspace>[]
      )
        .map((workspace) => Workspace.serialization.fromJson(workspace))
        .forEach((workspace) => {
          // NOTE we don't handle workspaces that only have conflict resolution but no standard workspace
          // since that indicates bad state of the SDLC server
          if (
            workspacesInConflictResolutionIds.includes(workspace.workspaceId)
          ) {
            workspace.type = WORKSPACE_TYPE.CONFLICT_RESOLUTION;
          }
          workspaceMap.set(workspace.workspaceId, workspace);
        });
      this.workspacesByProject.set(projectId, workspaceMap);
    } catch (error: unknown) {
      // TODO handle error when fetching workspaces for an individual project
      this.applicationStore.logger.error(CORE_LOG_EVENT.SETUP_PROBLEM, error);
    } finally {
      this.loadWorkspacesState.reset();
    }
  }

  *createWorkspace(projectId: string, workspaceId?: string): GeneratorFn<void> {
    this.createWorkspaceState.inProgress();
    try {
      assertNonNullable(workspaceId, 'workspace ID is required');
      const workspace = Workspace.serialization.fromJson(
        (yield this.applicationStore.networkClientManager.sdlcClient.createWorkspace(
          projectId,
          workspaceId,
        )) as PlainObject<Workspace>,
      );
      const existingWorkspaceForProject: Map<string, Workspace> | undefined =
        this.workspacesByProject.get(projectId);
      if (existingWorkspaceForProject) {
        existingWorkspaceForProject.set(workspaceId, workspace);
      } else {
        const newWorkspaceMap = observable<string, Workspace>(new Map());
        newWorkspaceMap.set(workspaceId, workspace);
        this.workspacesByProject.set(projectId, newWorkspaceMap);
      }
      this.applicationStore.notifySuccess(
        `Workspace '${workspace.workspaceId}' is succesfully created`,
      );
      this.setCurrentProjectId(projectId);
      this.setCurrentWorkspaceId(workspaceId);
      this.setCreateWorkspaceModal(false);
      this.createWorkspaceState.pass();
    } catch (error: unknown) {
      this.applicationStore.logger.error(CORE_LOG_EVENT.SETUP_PROBLEM, error);
      this.applicationStore.notifyError(error);
      this.createWorkspaceState.fail();
    }
  }
}

const SetupStoreContext = createContext<SetupStore | undefined>(undefined);

export const SetupStoreProvider = ({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement => {
  const applicationStore = useApplicationStore();
  const store = useLocalObservable(() => new SetupStore(applicationStore));
  return (
    <SetupStoreContext.Provider value={store}>
      {children}
    </SetupStoreContext.Provider>
  );
};

export const useSetupStore = (): SetupStore =>
  guaranteeNonNullable(
    useContext(SetupStoreContext),
    'useSetupStore() hook must be used inside SetupStore context provider',
  );
