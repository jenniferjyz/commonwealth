import { utils } from 'ethers';
import BN from 'bn.js';

import { Coin } from 'adapters/currency';

import { IApp } from 'state';
import { CWProtocol, CWProject } from 'models/CWProtocol';
import { CwProjectFactory as CWProjectFactory } from 'CwProjectFactory';
import { CwProject as CWProjectContract } from 'CwProject';

import CommonwealthChain from './chain';
import CommonwealthAPI from './api';

import { CWProtocolStore } from '../../../../stores';

export default class CommonwealthProtocol {
  private _initialized: boolean = false;
  private _app: IApp;
  private _api: CommonwealthAPI;
  private _store = new CWProtocolStore();
  private _chain: CommonwealthChain;

  // private _activeProjectHash: string;
  // private _activeProjectContract: CWProjectContract;

  public get initalized() { return this._initialized };
  public get app() { return this._app; }
  public get store() { return this._store; }

  constructor(app: IApp) {
    this._app = app;
  }

  public async init(chain: CommonwealthChain) {
    this._chain = chain;
    this._api = this._chain.CommonwealthAPI;

    const protocolFee = new BN((await this._api.Contract.protocolFee()).toString(), 10);
    const feeTo = await this._api.Contract.feeTo();

    const projects: CWProject[] =  await this.retrieveProjects();
    const newProtocol = new CWProtocol('root', 'root', protocolFee, feeTo, projects);

    this._initialized = true;
    this.store.add(newProtocol);
  }

  public async getProjectDetails(projAddress: string) {
    const projContract: CWProjectContract = await CWProjectFactory.connect(projAddress, this._api.Provider);

    const name = await projContract.name();
    const ipfsHash = await projContract.ipfsHash();
    const cwUrl = await projContract.cwUrl();
    const beneficiary = await projContract.beneficiary();
    const threshold = await projContract.threshold();
    const curatorFee = await projContract.curatorFee();
    const creator = await projContract.creator();
    const totalFunding = await projContract.totalFunding();

    const projectHash = utils.solidityKeccak256(
      ['address', 'address', 'bytes32', 'uint256'],
      [creator, beneficiary, name, threshold.toString()]
    );
    const daedline = (new BN((await projContract.deadline()).toString()).mul(new BN(1000))).toNumber();
    const endTime = new Date(daedline);
    const funded = await projContract.funded();

    let status = 'In Progress';
    if ((new Date()).getTime() - endTime.getTime() > 0) {
      if (funded) {
        status = 'Successed';
      } else {
        status = 'Failed';
      }
    }

    const bToken = await projContract.bToken();
    const backers = []  // get bToken holders

    const cToken = await projContract.cToken();
    const curators = []  // get cToken holders

    const newProj = new CWProject(
      utils.parseBytes32String(name),
      '',
      utils.parseBytes32String(ipfsHash),
      utils.parseBytes32String(cwUrl),
      beneficiary,
      '0x00', // aceptedTokens
      [], // nominations,
      threshold,
      endTime,
      curatorFee,
      projectHash,
      status,
      totalFunding,
      backers,
      curators
    );

    return newProj;
  }

  public async retrieveProjects() {
    const projects: CWProject[] =  [];
    const allProjectLenght = new BN((await this._api.Contract.allProjectsLength()).toString(), 10);
    if (allProjectLenght.gt(new BN(0))) {
      const projectAddresses = await this._api.Contract.getAllProjects();
      for (let i=0; i<projectAddresses.length; i++) {
        const proj: CWProject = await this.getProjectDetails(projectAddresses[i]);
        projects.push(proj);
      }
    }
    return projects;
  }

  public async deinit() {
    this.store.clear();
  }

  public async updateState() {
    const projects: CWProject[] =  await this.retrieveProjects();
    const protocolStore = this.store.getById('root');
    await protocolStore.setProjects(projects);
  }

  public async createProject(
    u_name: string,
    u_description: string,
    creator: string,
    beneficiary: string,

    threshold: number,
    curatorFee: number,
    u_period: number, // in days
  ) {
    const name = utils.formatBytes32String(u_name);
    const ipfsHash = utils.formatBytes32String('0x01');
    const cwUrl = utils.formatBytes32String('commonwealth.im');
    const acceptedTokens = ['0x0000000000000000000000000000000000000000']; // only Ether
    const nominations = [creator, beneficiary];
    const endtime = Math.ceil(Date.now() / 1000) + u_period * 24 * 60 * 60;

    console.log('====>threshold', threshold.toString())
    return {
      status: 'failed',
      projectHash: '',
    }
    // const contract = await this._api.attachSigner(this._chain.app.wallets, creator);

    // const createProjectTx = await contract.createProject(
    //   name,
    //   ipfsHash,
    //   cwUrl,
    //   beneficiary,
    //   acceptedTokens,
    //   nominations,
    //   threshold.toString(),
    //   endtime,
    //   curatorFee.toString(),
    //   '', // projectID
    // );
    // const txReceipt = await createProjectTx.wait();
    // if (txReceipt.status === 1) {
    //   const projectHash = utils.solidityKeccak256(
    //     ['address', 'address', 'bytes32', 'uint256'],
    //     [creator, beneficiary, name, threshold.toString()]
    //   );
    //   return {
    //     status: 'success',
    //     projectHash,
    //   }
    // } else {
    //   return {
    //     status: 'failed',
    //     projectHash: '',
    //   }
    // }
  }

  // public async setProjectContract(projectHash: string) {
  //   const api = this._chain.CommonwealthAPI;
  //   this._activeProjectHash = projectHash;
  //   const activeProjectAddress:string = await api.Contract.projects(projectHash);
  //   this._activeProjectContract = await CWProjectFactory.connect(activeProjectAddress, this._api.Provider);
  // }

  // private async syncActiveProject(projectHash: string) {
  //   if (!this._activeProjectHash || !this._activeProjectContract) {
  //     await this.setProjectContract(projectHash);
  //   }
  //   if (this._activeProjectHash !== projectHash) {
  //     await this.setProjectContract(projectHash);
  //   }
  // }

  public async getProjectContract(proj: string, byHash = false) {
    let projecAddress = proj;
    if (byHash) {
      projecAddress = await this._api.Contract.projects(proj);
    }
    const projectContract: CWProjectContract = await CWProjectFactory.connect(proj, this._api.Provider);
    return projectContract;
  }

  public async backProject(
    amount: number,
    projectHash: string,
  ) {
    // await this.syncActiveProject(projectHash);
    // await this._activeProjectContract.back('0x01', amount)
  }

  public async curateProject(
    amount: number,
    projectHash: string,
  ) {
    // await this.syncActiveProject(projectHash);
    // await this._activeProjectContract.curate('0x01', amount)
  }

  public async redeemBToken(
    amount: number,
    projectHash: string,
  ) {
    // await this.syncActiveProject(projectHash);
    // await this._activeProjectContract.redeemBToken('0x01', amount)
  }

  public async redeemCToken(
    amount: number,
    projectHash: string,
  ) {
    // await this.syncActiveProject(projectHash);
    // await this._activeProjectContract.redeemCToken('0x01', amount)
  }

  public async getCollatoralAmount(isBToken, address, projectHash) {
  }
}
 