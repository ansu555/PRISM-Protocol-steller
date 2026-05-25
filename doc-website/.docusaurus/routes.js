import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/__docusaurus/debug',
    component: ComponentCreator('/__docusaurus/debug', '5ff'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/config',
    component: ComponentCreator('/__docusaurus/debug/config', '5ba'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/content',
    component: ComponentCreator('/__docusaurus/debug/content', 'a2b'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/globalData',
    component: ComponentCreator('/__docusaurus/debug/globalData', 'c3c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/metadata',
    component: ComponentCreator('/__docusaurus/debug/metadata', '156'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/registry',
    component: ComponentCreator('/__docusaurus/debug/registry', '88c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/routes',
    component: ComponentCreator('/__docusaurus/debug/routes', '000'),
    exact: true
  },
  {
    path: '/',
    component: ComponentCreator('/', '61f'),
    routes: [
      {
        path: '/',
        component: ComponentCreator('/', '92b'),
        routes: [
          {
            path: '/',
            component: ComponentCreator('/', '221'),
            routes: [
              {
                path: '/compliance-posture',
                component: ComponentCreator('/compliance-posture', 'fcb'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/core-operations',
                component: ComponentCreator('/core-operations', '275'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/core-protocol-layer',
                component: ComponentCreator('/core-protocol-layer', '31d'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/edge-case-handling',
                component: ComponentCreator('/edge-case-handling', '87d'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/financial-model',
                component: ComponentCreator('/financial-model', 'd36'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/glossary',
                component: ComponentCreator('/glossary', 'f22'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/integrity-layer',
                component: ComponentCreator('/integrity-layer', '9ba'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/market-design',
                component: ComponentCreator('/market-design', '73b'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/risk-market-layer',
                component: ComponentCreator('/risk-market-layer', '0e3'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/roadmap',
                component: ComponentCreator('/roadmap', '268'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/security-controls',
                component: ComponentCreator('/security-controls', 'd35'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/sourcing-layer',
                component: ComponentCreator('/sourcing-layer', '16d'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/surface-layer',
                component: ComponentCreator('/surface-layer', 'fd5'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/system-architecture',
                component: ComponentCreator('/system-architecture', 'b7c'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/token-model',
                component: ComponentCreator('/token-model', 'b7d'),
                exact: true,
                sidebar: "docsSidebar"
              },
              {
                path: '/',
                component: ComponentCreator('/', '780'),
                exact: true,
                sidebar: "docsSidebar"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
