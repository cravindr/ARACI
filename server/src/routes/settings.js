import { Router } from "express";
import { authRequired, requireAdministrator } from "../middleware/auth.js";
import {
  getCustomerListPageSize,
  setCustomerListPageSize,
  getJewelLoanDefaultTouchPct,
  getJewelLoanDefaultInterestRate,
  setJewelLoanDefaultTouchPct,
  setJewelLoanDefaultInterestRate,
  getCompanyName,
  getCompanyAddress,
  getCompanyLicenceNumber,
  getCustomerCopyHeaderHtml,
  getCustomerCopyTermsHtml,
  getCustomerCopyFooterHtml,
  setCompanyName,
  setCompanyAddress,
  setCompanyLicenceNumber,
  setCustomerCopyHeaderHtml,
  setCustomerCopyTermsHtml,
  setCustomerCopyFooterHtml,
} from "../appSettings.js";

export const settingsRouter = Router();

settingsRouter.get("/", authRequired, async (_req, res, next) => {
  try {
    const [
      customerListPageSize,
      jewelLoanDefaultTouchPct,
      jewelLoanDefaultInterestRate,
      companyName,
      companyAddress,
      companyLicenceNumber,
      customerCopyHeaderHtml,
      customerCopyTermsHtml,
      customerCopyFooterHtml,
    ] = await Promise.all([
      getCustomerListPageSize(),
      getJewelLoanDefaultTouchPct(),
      getJewelLoanDefaultInterestRate(),
      getCompanyName(),
      getCompanyAddress(),
      getCompanyLicenceNumber(),
      getCustomerCopyHeaderHtml(),
      getCustomerCopyTermsHtml(),
      getCustomerCopyFooterHtml(),
    ]);
    res.json({
      customerListPageSize,
      jewelLoanDefaultTouchPct,
      jewelLoanDefaultInterestRate,
      companyName,
      companyAddress,
      companyLicenceNumber,
      customerCopyHeaderHtml,
      customerCopyTermsHtml,
      customerCopyFooterHtml,
    });
  } catch (e) {
    next(e);
  }
});

settingsRouter.put(
  "/",
  authRequired,
  requireAdministrator,
  async (req, res, next) => {
    try {
      const body = req.body || {};
      let customerListPageSize = await getCustomerListPageSize();
      let jewelLoanDefaultTouchPct = await getJewelLoanDefaultTouchPct();
      let jewelLoanDefaultInterestRate = await getJewelLoanDefaultInterestRate();
      let companyName = await getCompanyName();
      let companyAddress = await getCompanyAddress();
      let companyLicenceNumber = await getCompanyLicenceNumber();
      let customerCopyHeaderHtml = await getCustomerCopyHeaderHtml();
      let customerCopyTermsHtml = await getCustomerCopyTermsHtml();
      let customerCopyFooterHtml = await getCustomerCopyFooterHtml();

      if (body.customerListPageSize !== undefined) {
        customerListPageSize = await setCustomerListPageSize(body.customerListPageSize);
      }
      if (body.jewelLoanDefaultTouchPct !== undefined) {
        jewelLoanDefaultTouchPct = await setJewelLoanDefaultTouchPct(
          body.jewelLoanDefaultTouchPct
        );
      }
      if (body.jewelLoanDefaultInterestRate !== undefined) {
        jewelLoanDefaultInterestRate = await setJewelLoanDefaultInterestRate(
          body.jewelLoanDefaultInterestRate
        );
      }
      if (body.companyName !== undefined) {
        companyName = await setCompanyName(body.companyName);
      }
      if (body.companyAddress !== undefined) {
        companyAddress = await setCompanyAddress(body.companyAddress);
      }
      if (body.companyLicenceNumber !== undefined) {
        companyLicenceNumber = await setCompanyLicenceNumber(body.companyLicenceNumber);
      }
      if (body.customerCopyHeaderHtml !== undefined) {
        customerCopyHeaderHtml = await setCustomerCopyHeaderHtml(body.customerCopyHeaderHtml);
      }
      if (body.customerCopyTermsHtml !== undefined) {
        customerCopyTermsHtml = await setCustomerCopyTermsHtml(body.customerCopyTermsHtml);
      }
      if (body.customerCopyFooterHtml !== undefined) {
        customerCopyFooterHtml = await setCustomerCopyFooterHtml(body.customerCopyFooterHtml);
      }

      res.json({
        customerListPageSize,
        jewelLoanDefaultTouchPct,
        jewelLoanDefaultInterestRate,
        companyName,
        companyAddress,
        companyLicenceNumber,
        customerCopyHeaderHtml,
        customerCopyTermsHtml,
        customerCopyFooterHtml,
      });
    } catch (e) {
      const code = e.statusCode;
      if (code === 400) {
        return res.status(400).json({ error: e.message });
      }
      next(e);
    }
  }
);
