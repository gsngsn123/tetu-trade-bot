import {Trade} from "./Trade";

Trade.start()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
