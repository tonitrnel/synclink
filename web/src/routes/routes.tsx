import {
  FC,
  FunctionComponent,
  lazy,
  LazyExoticComponent,
  Suspense,
} from 'react';
import {
  BrowserRouter as Router,
  Routes as Switch,
  Route,
} from 'react-router-dom';
import { getDeviceType } from '~/utils/get-device-type';

const PAGE_MAP = import.meta.glob([
  '../pages/**/*.tsx',
  '!../pages/app.tsx',
]) as {
  [P: string]: () => Promise<{
    default: FunctionComponent;
    [M: string]: unknown;
  }>;
};

const ModuleNotExportPage: FC = () => {
  return (
    <div className="p-4">
      <h2 className="text-error-main font-bold text-xl">Error</h2>
      <p>Module does not export pages!</p>
    </div>
  );
};
const ModuleNotFound: FC = () => {
  return (
    <div className="p-4">
      <h2 className="text-error-main font-bold text-xl">Error </h2>
      <p>Module not found!</p>
    </div>
  );
};

const routeMap = new Map<
  string,
  {
    relationPath: string;
    urlPath: string;
    Component: LazyExoticComponent<FC>;
  }
>();
const isDesktop = getDeviceType(navigator.userAgent) == 'desktop';
for (const relationPath of Object.keys(PAGE_MAP)) {
  if (/\/_[\w/-]+/gm.test(relationPath)) continue;
  const urlPath = relationPath
    .replace(/^[.]+\/pages\//, '')
    .replace(/\/index\.tsx$/, '')
    .replace(/\.tsx$/, '')
    .replace('_', '-')
    .replace(/([\w-]+)\/([\w-]+)$/gm, (_, v1: string, v2: string) => {
      return v1.replace('-', '').toLowerCase() === v2.toLowerCase()
        ? `${v1}`
        : _;
    });
  if (urlPath === 'App') continue;
  routeMap.set(relationPath, {
    relationPath,
    urlPath:
      urlPath.toLowerCase() === (isDesktop ? 'desktop' : 'mobile')
        ? '/'
        : `/${urlPath}`,
    Component: lazy(() =>
      PAGE_MAP[relationPath]().then((module) => {
        if (!module.default) return { default: ModuleNotExportPage };
        return module;
      }),
    ),
  });
}

export const Routes = () => {
  return (
    <Suspense>
      <Router>
        <Switch>
          {Array.from(routeMap.values()).map(
            ({ relationPath, urlPath, Component }) => {
              return (
                <Route
                  key={relationPath}
                  path={urlPath}
                  element={<Component />}
                />
              );
            },
          )}
          <Route path="*" element={<ModuleNotFound />} />
        </Switch>
      </Router>
    </Suspense>
  );
};

Routes.map = routeMap;
