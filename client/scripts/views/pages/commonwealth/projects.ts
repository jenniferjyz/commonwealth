import 'pages/commonwealth/projects.scss';

import m from 'mithril';

import app from 'state';
import Sublayout from 'views/sublayout';
import PageLoading from 'views/pages/loading';
import Listing from 'views/pages/listing';
import ProjectCard from 'views/components/project_card';

const ProjectsPage: m.Component<{}, { initializing: boolean }> = {
  oncreate: async (vnode) => {
    // if (!app.chain || !app.chain.loaded) {
    //   vnode.state.initializing = true;
    //   await initChain();
    //   vnode.state.protocol = (app.chain as any).protocol;
    //   vnode.state.initializing = false;
    //   m.redraw(); 
    // } else if (app.chain && (app.chain as any).protocol && !vnode.state.protocol) {
    //   vnode.state.protocol = (app.chain as any).protocol;
    //   m.redraw();
    // }
  },
  view: (vnode) => {
    if (vnode.state.initializing || !app.chain) {
      return m(PageLoading);
    }
    const protocol = (app.chain as any).protocol;
    if (!protocol || !protocol.initalized) {
      return m(PageLoading);
    }
    const projects  = protocol._store.getById('root').projects || [];
    const activeProjectsContent = projects.filter((p) => p.status === 'In Progress').map((p) => m(ProjectCard, { project: p }));
    const failedProjects = projects.filter((p) => p.status === 'Failed').map((p) => m(ProjectCard, { project: p }));
    const successedProjects = projects.filter((p) => p.status === 'Successed').map((p) => m(ProjectCard, { project: p }));

    return m(Sublayout, {
      class: 'ProjectsPage',
      title: 'Projects',
      showNewProposalButton: true,
    }, [
      m('.stats-box', [
        m('div', [
          'This is a UI version that use offchain local data, a production version will interact with real chain and contract data.',
        ]),
        m('div', '- Please login and connect your wallet'),
        m('div', '- Protocol information (like protocolFee and feeTo) will be set by admin or Protocol manager'),
        m('div', '- Curators can redeem CTokens when project funding is successed'),
        m('div', '- Backers can redeem BTokens when project funding is failed'),
        m('div', '- Beneficiary can only withdraw when project funding is successed'),
      ]),
      m(Listing, {
        content: activeProjectsContent,
        columnHeader: `${activeProjectsContent.length === 0 ? 'No' : ''} Active Proposals`,
      }),
      m('.clear'),
      m(Listing, {
        content: successedProjects,
        columnHeader: `${successedProjects.length === 0 ? 'No' : ''} Successed Proposals`,
      }),
      m('.clear'),
      m(Listing, {
        content: failedProjects,
        columnHeader: `${failedProjects.length === 0 ? 'No' : ''} Failed Proposals`,
      }),
    ]);
  }
};

export default ProjectsPage;
