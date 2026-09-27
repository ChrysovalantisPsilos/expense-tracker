// Every Greek namespace: one lazy chunk, loaded by i18n.js loadLanguage('el').
// One file per namespace (a feature, or common/shell): translators each work in
// their own file. A new namespace is added here and in the other language's index.
import auth from './auth.js'
import backup from './backup.js'
import budgets from './budgets.js'
import categories from './categories.js'
import common from './common.js'
import dashboard from './dashboard.js'
import groups from './groups.js'
import help from './help.js'
import importNs from './import.js'
import insights from './insights.js'
import landing from './landing.js'
import notifications from './notifications.js'
import onboarding from './onboarding.js'
import plan from './plan.js'
import privacy from './privacy.js'
import recurring from './recurring.js'
import savings from './savings.js'
import settings from './settings.js'
import shell from './shell.js'
import transactions from './transactions.js'
import whatsnew from './whatsnew.js'

export default {
  auth,
  backup,
  budgets,
  categories,
  common,
  dashboard,
  groups,
  help,
  import: importNs,
  insights,
  landing,
  notifications,
  onboarding,
  plan,
  privacy,
  recurring,
  savings,
  settings,
  shell,
  transactions,
  whatsnew,
}
