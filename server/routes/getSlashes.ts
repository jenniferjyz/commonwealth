import Sequelize from 'sequelize';
import { Request, Response, NextFunction } from 'express';
import { Errors } from './getOffences';

const Op = Sequelize.Op;

const slashQuery = async (models, req: Request, res: Response, next: NextFunction) => {
  const { chain, stash } = req.query;
  let { startDate, endDate } = req.query;

  if (!chain) return next(new Error(Errors.ChainIdNotFound));
  const chainInfo = await models.Chain.findOne({ where: { id: chain } });
  if (!chainInfo) return next(new Error(Errors.InvalidChain));

  // if date isn't defined we get for last 30 days
  if (typeof startDate === 'undefined' || typeof endDate === 'undefined') {
    const daysAgo = 30;
    startDate = new Date(); // today
    startDate.setDate(startDate.getDate() - daysAgo); // 30 days ago
    startDate = new Date(startDate); // formatted
    endDate = new Date(); // today
  }

  let where: any = {
    chain_event_type_id: `${chain}-slash`
  };

  if (stash) {
    const stashCheck = { [Op.and]: Sequelize.literal(`event_data->>'validator' = '${stash}'`) };
    where = Object.assign(where, stashCheck);
  }

  if (startDate && endDate) {
    where.created_at = {
      [Op.between]: [startDate, endDate]
    };
  }

  const slashes = await models.ChainEvent.findAll({
    where,
    order: [
      ['created_at', 'ASC']
    ],
  });
  return slashes;
};
const getSlashes = async (models, req: Request, res: Response, next: NextFunction) => {
  console.log("=========== slashes ========= ")
  const slashes = await slashQuery(models, req, res, next);
  console.log("=========== slashes ========= ", slashes);
  return res.json({ status: 'Success', result: slashes });
};

export default getSlashes;
