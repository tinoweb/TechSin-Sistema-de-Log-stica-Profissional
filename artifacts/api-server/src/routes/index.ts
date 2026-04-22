import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
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
import { requireSuperAdmin } from "../middlewares/auth";

const router: IRouter = Router();

/* Rotas publicas de infra / auth (authGuard global deixa passar). */
router.use(healthRouter);
router.use(authRouter);

/* Rotas globais do dono do SaaS (exige role=superadmin). */
router.use("/super-admin", requireSuperAdmin);
router.use(superAdminRouter);

/* Rotas do dia-a-dia do tenant. Usuario ja autenticado pelo authGuard. */
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
