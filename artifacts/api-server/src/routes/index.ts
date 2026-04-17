import { Router, type IRouter } from "express";
import healthRouter from "./health";
import transportadorasRouter from "./transportadoras";
import motoristasRouter from "./motoristas";
import motoristasGenerateToken from "./motoristas-generate-token";
import clientesRouter from "./clientes";
import viagensRouter from "./viagens";
import canhotosRouter from "./canhotos";
import xmlsRouter from "./xmls";
import faturasRouter from "./faturas";
import dashboardRouter from "./dashboard";
import superAdminRouter from "./super-admin";
import erpSyncRouter from "./erp-sync";
import testEmailRouter from "./test-email";

const router: IRouter = Router();

router.use(healthRouter);
router.use(superAdminRouter);
router.use(erpSyncRouter);
router.use(transportadorasRouter);
router.use(motoristasRouter);
router.use(motoristasGenerateToken);
router.use(clientesRouter);
router.use(viagensRouter);
router.use(canhotosRouter);
router.use(xmlsRouter);
router.use(faturasRouter);
router.use(dashboardRouter);
router.use(testEmailRouter);

export default router;
