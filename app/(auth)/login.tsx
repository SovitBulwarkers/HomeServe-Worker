import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, fontWeight, spacing, radius, shadow } from '../../src/theme';
import Button from '../../src/components/Button';
import { useAuth } from '../../src/store/auth-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TERMS_SECTIONS = [
  { id: 1, title: '1. ABOUT HOMESERVE', body: 'HomeServe operates a technology platform that connects customers who need home services with service professionals ("Workers", "Service Professionals", "you", or "your").\n\nServices may include:\n• Home cleaning\n• Deep cleaning\n• Plumbing\n• Electrical services\n• AC servicing and repair\n• Carpentry\n• Painting\n• Appliance services\n• Pest control\n• Other services listed on the platform\n\nHomeServe may add, remove, modify, or discontinue services or features at any time.' },
  { id: 2, title: '2. WORKER STATUS', body: 'Unless a separate written agreement states otherwise, you participate on the HomeServe platform as an independent service professional.\n\nThese Terms do not automatically create:\n• An employer-employee relationship\n• A partnership\n• A joint venture\n• An agency relationship\n• An exclusive employment relationship\n\nYou are responsible for managing your availability, accepting suitable jobs, maintaining your qualifications, and performing accepted services professionally and legally.\n\nNothing in these Terms overrides any mandatory rights or obligations under applicable law.' },
  { id: 3, title: '3. ELIGIBILITY', body: 'To become and remain a HomeServe Worker, you must:\n• Be legally capable of entering into a binding agreement.\n• Provide accurate registration information.\n• Provide a valid mobile number.\n• Complete required identity/KYC verification.\n• Provide accurate bank/payment information.\n• Have the skills and qualifications necessary for the services you provide.\n• Maintain any licenses or certifications required by law.\n• Comply with applicable laws and regulations.\n• Not be suspended or permanently removed from the platform.\n\nHomeServe may request additional information or documents for verification, safety, compliance, or operational purposes.' },
  { id: 4, title: '4. WORKER ACCOUNT', body: 'Your Worker account is personal to you.\n\nYou must:\n• Keep your authentication information confidential.\n• Never share your account with another person.\n• Never allow another person to perform a job using your account.\n• Keep your personal information accurate and updated.\n• Immediately report suspected unauthorized account access.\n\nYou are responsible for activity performed through your account, except where caused by circumstances outside your reasonable control and promptly reported to HomeServe.' },
  { id: 5, title: '5. IDENTITY AND KYC VERIFICATION', body: 'HomeServe may request:\n• Government-issued identification\n• Photograph\n• Address information\n• Bank account information\n• Professional certificates\n• Licenses\n• Background verification information where applicable\n• Tax information\n• Other information reasonably required for verification\n\nYou authorize HomeServe to verify information provided by you through lawful means.\n\nProviding false, altered, stolen, expired, or misleading documents may result in:\n• Registration rejection\n• Account suspension\n• Account termination\n• Cancellation of bookings\n• Restriction of platform features\n• Withholding of amounts where legally permitted\n• Reporting to appropriate authorities where required' },
  { id: 6, title: '6. SERVICE SKILLS AND QUALIFICATIONS', body: 'You must only accept jobs that you are qualified and competent to perform.\n\nYou must not:\n• Claim qualifications you do not have.\n• Perform regulated work without the required authorization.\n• Perform work that you cannot safely perform.\n• Accept services outside your stated skills when doing so could create a safety or quality risk.\n• Delegate a booking to another person without HomeServe\'s authorization.' },
  { id: 7, title: '7. WORKER AVAILABILITY', body: 'You may indicate your availability through the App.\n\nAvailability does not guarantee that you will receive bookings.\n\nJob allocation may consider factors including:\n• Location\n• Service category\n• Availability\n• Customer requirements\n• Worker status\n• Ratings\n• Service quality\n• Historical performance\n• Response time\n• Cancellation history\n• Platform policies\n• Operational requirements\n\nHomeServe does not guarantee minimum bookings, customers, working hours, or earnings unless separately agreed in writing.' },
  { id: 8, title: '8. JOB REQUESTS', body: 'When a job is offered to you, you should review the available information before accepting it.\n\nThe information may include:\n• Service type\n• Customer location\n• Scheduled date\n• Scheduled time\n• Estimated duration\n• Service price\n• Customer instructions\n• Special requirements\n\nAfter accepting a booking, you are expected to reasonably fulfill it.' },
  { id: 9, title: '9. JOB ACCEPTANCE', body: 'After accepting a booking, you must:\n• Attend the customer\'s location within the scheduled timeframe.\n• Follow the service requirements.\n• Communicate professionally.\n• Follow safety procedures.\n• Perform the agreed service.\n• Use required tools and materials responsibly.\n• Upload required service evidence.\n• Properly complete the job before marking it completed.\n\nRepeated acceptance followed by avoidable cancellation may result in account review.' },
  { id: 10, title: '10. WORKER CANCELLATION', body: 'You should not cancel an accepted booking unless there is a legitimate reason.\n\nExamples include:\n• Emergency\n• Illness\n• Unsafe working conditions\n• Incorrect booking information\n• Customer safety concerns\n• Technical problems\n• Circumstances beyond your reasonable control\n\nRepeated avoidable cancellations may result in:\n• Warning\n• Reduced job visibility\n• Temporary suspension\n• Account review\n• Other measures permitted by applicable law and platform policy\n\nYou must not cancel a booking merely to obtain another or more profitable booking.' },
  { id: 11, title: '11. CUSTOMER CANCELLATION', body: 'Customers may cancel bookings according to the applicable cancellation policy.\n\nThe effect of cancellation on Worker compensation may depend on:\n• Booking status\n• Cancellation timing\n• Worker arrival status\n• Payment status\n• Applicable cancellation policy\n• Platform rules\n\nAny applicable cancellation compensation will be calculated according to the applicable HomeServe policy.' },
  { id: 12, title: '12. ARRIVAL AND CHECK-IN', body: 'Where required, you must use the App\'s approved arrival/check-in functionality.\n\nYou must not:\n• Falsely mark yourself as arrived.\n• Manipulate GPS information.\n• Check in before actually arriving.\n• Ask another person to check in for you.\n\nFalse check-in information may result in account action.' },
  { id: 13, title: '13. JOB START VERIFICATION', body: 'Where a customer/job start OTP or verification code is required, you must use the approved verification process.\n\nYou must not:\n• Repeatedly guess OTPs.\n• Attempt to bypass verification.\n• Mark a job as started without completing the required verification.\n• Misuse or store customer authentication information.' },
  { id: 14, title: '14. SERVICE PERFORMANCE', body: 'Workers must perform services:\n• Professionally\n• Honestly\n• Safely\n• With reasonable care and skill\n• According to the booked service\n• According to applicable service instructions\n\nYou must use tools and materials responsibly and follow applicable safety requirements.' },
  { id: 15, title: '15. ADDITIONAL WORK', body: 'You must not pressure customers to purchase additional services.\n\nAdditional work should only be performed when:\n• The customer requests or agrees to it.\n• The service is permitted by HomeServe.\n• The additional charge is recorded through the App.\n• Required approval has been obtained.\n\nYou must not collect unauthorized additional fees directly from customers.' },
  { id: 16, title: '16. EXTRA CHARGES', body: 'Where additional work or materials are genuinely required, you must use the approved HomeServe extra-charge process.\n\nYou must not:\n• Create fake extra charges.\n• Inflate material costs.\n• Split charges to avoid platform controls.\n• Pressure customers to approve charges.\n• Collect unauthorized off-platform amounts.\n\nCustomers may approve or reject additional charges through the platform.' },
  { id: 17, title: '17. EXTRA TIME', body: 'If a service legitimately requires additional time beyond the booked duration, you may request additional time through the App when eligible.\n\nYou must provide accurate:\n• Additional minutes\n• Reason\n• Relevant information\n\nHomeServe may apply a grace period according to the applicable service policy.\n\nYou must not request extra time:\n• Before it is reasonably required.\n• To artificially increase earnings.\n• Without actually providing the additional service.\n• After the job has already been completed.\n• Through duplicate requests.\n\nFraudulent extra-time requests may result in account action.' },
  { id: 18, title: '18. EXTRA-TIME APPROVAL', body: 'Extra time may require customer approval.\n\nDepending on the applicable payment method:\n• The customer may approve the request without immediate additional payment.\n• The customer may be required to make an additional payment through the platform.\n• The amount may be settled through the platform\'s payment system.\n\nYou must not pressure or mislead customers into approving extra time.' },
  { id: 19, title: '19. RESCHEDULING', body: 'Where available, Workers may request rescheduling through the App.\n\nA Worker rescheduling request does not automatically change the booking time where customer approval is required.\n\nThe Worker must follow the existing booking schedule until the new time is officially confirmed.' },
  { id: 20, title: '20. RUNNING LATE', body: 'If you expect to be late, you should notify the customer through the approved platform mechanism.\n\nYou should provide accurate information about:\n• Expected arrival time\n• Reason for delay\n• Updated timing\n\nRepeated avoidable delays may affect your account.' },
  { id: 21, title: '21. CUSTOMER COMMUNICATION', body: 'You must communicate professionally with customers.\n\nYou must not:\n• Harass customers.\n• Threaten customers.\n• Use abusive language.\n• Make discriminatory remarks.\n• Engage in sexual harassment or inappropriate conduct.\n• Request unnecessary personal information.\n• Repeatedly contact customers for unrelated purposes.\n• Pressure customers to move payments outside the platform.' },
  { id: 22, title: '22. OFF-PLATFORM TRANSACTIONS', body: 'You must not intentionally move HomeServe customers off the platform to avoid:\n• Platform fees\n• Commission\n• Payment processing\n• Safety mechanisms\n• Customer support\n• Dispute processes\n• Booking records\n\nExamples include asking a customer to cancel a HomeServe booking and pay you directly.' },
  { id: 23, title: '23. CASH PAYMENTS', body: 'Where cash payment is enabled, you must:\n• Collect only the authorized amount.\n• Not add unauthorized charges.\n• Record the payment correctly.\n• Provide required confirmation or receipt.\n• Follow HomeServe payment instructions.\n\nYou must not collect unauthorized cash in addition to an already completed platform payment.' },
  { id: 24, title: '24. DIGITAL PAYMENTS', body: 'You must not ask customers to transfer money to:\n• Your personal bank account\n• Your personal UPI account\n• Your personal wallet\n• An unrelated payment account\n\nunless HomeServe expressly authorizes that payment method.' },
  { id: 25, title: '25. WORKER EARNINGS', body: 'Worker earnings may depend on:\n• Service price\n• Commission\n• Applicable taxes\n• Cancellation compensation\n• Extra charges\n• Extra time\n• Refunds\n• Adjustments\n• Payment status\n• Other applicable platform rules\n\nThe customer-facing service price is not necessarily the Worker’s final earnings.' },
  { id: 26, title: '26. COMMISSION', body: 'HomeServe may deduct applicable platform commission or other agreed charges.\n\nCommission may vary according to:\n• Service category\n• Location\n• Worker agreement\n• Promotional programs\n• Applicable platform policy' },
  { id: 27, title: '27. WORKER WALLET', body: 'Where available, the Worker Wallet may contain:\n• Service earnings\n• Adjustments\n• Settlements\n• Refund/reversal adjustments\n• Commission adjustments\n• Other permitted transactions\n\nYou must not attempt to manipulate wallet balances or transaction records.' },
  { id: 28, title: '28. WALLET FRAUD', body: 'You must not:\n• Submit duplicate payment claims.\n• Create fraudulent payment references.\n• Exploit duplicate transactions.\n• Manipulate refunds.\n• Exploit technical errors.\n• Attempt unauthorized wallet credits.\n\nFraudulent wallet activity may result in account suspension or termination.' },
  { id: 29, title: '29. WORKER DEBT', body: 'Where applicable, the platform may record legitimate amounts payable by a Worker, including unpaid commission or other authorized adjustments.\n\nWorkers may view applicable transaction information through the App where available.' },
  { id: 30, title: '30. WITHDRAWALS', body: 'Workers may request withdrawal of eligible earnings according to the applicable withdrawal policy.\n\nBefore processing a withdrawal, HomeServe may verify:\n• Identity\n• Bank details\n• Account status\n• Available balance\n• Transaction status\n• Outstanding legitimate adjustments\n\nWithdrawals may be delayed because of:\n• Bank processing\n• Payment-provider processing\n• Verification\n• Security review\n• Incorrect bank information\n• Technical issues\n• Legal requirements' },
  { id: 31, title: '31. BANK ACCOUNT INFORMATION', body: 'You must provide accurate bank information.\n\nYou are responsible for ensuring that:\n• Account holder information is correct.\n• Account number is correct.\n• IFSC is correct.\n• Bank details are current.\n• The account is legally eligible to receive your earnings.' },
  { id: 32, title: '32. REFUNDS', body: 'Customers may receive refunds according to the applicable refund policy.\n\nA refund may affect the associated Worker earnings where applicable.\n\nWorkers must not:\n• Interfere with legitimate refund processing.\n• Create false refund claims.\n• Pressure customers to make fraudulent claims.' },
  { id: 33, title: '33. DISPUTES', body: 'Customers and Workers may raise disputes through HomeServe.\n\nDisputes may relate to:\n• Service quality\n• Incomplete work\n• Property damage\n• Payment\n• Extra charges\n• Extra time\n• Cancellation\n• Worker conduct\n• Customer conduct\n• Other booking issues\n\nWorkers must provide truthful information and supporting evidence.' },
  { id: 34, title: '34. DISPUTE EVIDENCE', body: 'HomeServe may consider:\n• Booking records\n• Payment records\n• Chat messages\n• Timestamps\n• Photographs\n• Before/after evidence\n• GPS/check-in information\n• Service details\n• Customer statements\n• Worker statements\n• Platform logs\n\nYou must not fabricate or manipulate evidence.' },
  { id: 35, title: '35. BEFORE/AFTER PHOTOS', body: 'Where required, Workers must upload genuine before/after photographs.\n\nPhotos must:\n• Represent the actual service.\n• Belong to the relevant booking.\n• Not be reused from another job.\n• Not be deceptively manipulated.\n• Avoid unnecessary personal or sensitive information.' },
  { id: 36, title: '36. CUSTOMER PROPERTY', body: 'You must treat customer property with reasonable care.\n\nYou must not:\n• Steal property.\n• Intentionally damage property.\n• Remove property without permission.\n• Misuse property.\n• Retain property without authorization.\n\nAccidental damage should be reported promptly through HomeServe.' },
  { id: 37, title: '37. LOST PROPERTY', body: 'If you find customer property, you must:\n• Inform the customer where reasonably possible.\n• Report it to HomeServe.\n• Follow the lost-property process.\n• Not keep, sell, or misuse the property.' },
  { id: 38, title: '38. SAFETY', body: 'You should not perform work where there is a serious and unreasonable safety risk.\n\nExamples may include:\n• Exposed electrical hazards\n• Fire\n• Dangerous chemicals\n• Structural instability\n• Violent behavior\n• Dangerous animals\n• Other serious hazards\n\nReport serious safety concerns through the appropriate HomeServe support mechanism.' },
  { id: 39, title: '39. SOS', body: 'The Worker App may provide an SOS feature for genuine emergencies.\n\nExamples include:\n• Immediate threat of violence\n• Serious accident\n• Medical emergency\n• Serious safety threat\n\nSOS must not be misused for ordinary support requests.\n\nThe SOS feature does not replace local emergency services.' },
  { id: 40, title: '40. PROHIBITED CONDUCT', body: 'Workers must not:\n• Commit fraud.\n• Steal.\n• Threaten customers.\n• Impersonate another person.\n• Share accounts.\n• Manipulate GPS.\n• Falsify job completion.\n• Upload fake photographs.\n• Submit false expenses.\n• Create fake bookings.\n• Manipulate ratings.\n• Abuse coupons or promotions.\n• Manipulate wallet balances.\n• Submit fraudulent payment claims.\n• Misuse customer information.\n• Harass customers.\n• Engage in discrimination.\n• Engage in sexual misconduct.\n• Intentionally damage property.\n• Bypass platform payments.\n• Manipulate platform systems.' },
  { id: 41, title: '41. ALCOHOL AND DRUGS', body: 'You must not perform services while impaired by alcohol, illegal drugs, or any substance that makes you unsafe to perform the service.\n\nHomeServe may take safety-related action where impairment is reasonably suspected.' },
  { id: 42, title: '42. CUSTOMER PERSONAL INFORMATION', body: 'You may receive customer information such as:\n• Name\n• Phone number\n• Address\n• Location\n• Booking details\n• Messages\n• Photographs\n• Service information\n\nYou may use this information only for legitimate HomeServe service purposes.\n\nYou must not:\n• Sell customer information.\n• Share customer information without authorization.\n• Publish customer information.\n• Use customer information for unrelated purposes.\n• Contact customers for unauthorized personal or commercial purposes.' },
  { id: 43, title: '43. LOCATION INFORMATION', body: 'The Worker App may use location information for:\n• Job matching\n• Navigation\n• Arrival verification\n• Live tracking\n• ETA calculation\n• Safety\n• Fraud prevention\n• Operational purposes\n\nLocation information is handled according to the HomeServe Privacy Policy and applicable law.' },
  { id: 44, title: '44. CHAT', body: 'HomeServe may provide chat between Workers, customers, and support.\n\nChat may be used for:\n• Service communication\n• Customer support\n• Dispute resolution\n• Safety\n• Fraud prevention\n• Platform operations\n\nWorkers must not use chat to harass, threaten, manipulate payments, or send prohibited content.' },
  { id: 45, title: '45. RATINGS AND REVIEWS', body: 'Customers may rate Workers after services.\n\nWorkers must not:\n• Create fake accounts to manipulate ratings.\n• Pressure customers to give specific ratings.\n• Threaten customers over reviews.\n• Manipulate reviews.\n• Offer unauthorized compensation for positive ratings.' },
  { id: 46, title: '46. ACCOUNT SUSPENSION', body: 'HomeServe may temporarily restrict an account where reasonably necessary for:\n• Safety\n• Fraud prevention\n• Identity verification\n• Investigation\n• Payment review\n• Customer complaints\n• Policy violations\n• Legal requirements\n\nSome Worker features may be unavailable during suspension.' },
  { id: 47, title: '47. ACCOUNT TERMINATION', body: 'HomeServe may terminate or permanently restrict an account where permitted by law, including for:\n• Fraud\n• Theft\n• Serious misconduct\n• Identity fraud\n• Document fraud\n• Payment manipulation\n• Serious customer abuse\n• Repeated safety violations\n• Unauthorized account sharing\n• Serious or repeated Terms violations\n• Repeated off-platform transactions' },
  { id: 48, title: '48. APPEALS', body: 'If your account is suspended or terminated, you may contact HomeServe through the available support or appeal mechanism.\n\nYou may be asked to provide:\n• An explanation\n• Supporting documents\n• Transaction information\n• Other relevant evidence\n\nHomeServe may review the matter according to its applicable policies.' },
  { id: 49, title: '49. APP AVAILABILITY', body: 'HomeServe attempts to keep the App available but does not guarantee uninterrupted service.\n\nThe App may be temporarily unavailable due to:\n• Maintenance\n• Updates\n• Network failures\n• Third-party service failures\n• Payment-provider issues\n• Cloud infrastructure issues\n• Security incidents\n• Circumstances beyond reasonable control' },
  { id: 50, title: '50. THIRD-PARTY SERVICES', body: 'The platform may use third-party services for:\n• Payments\n• Messaging\n• Maps\n• Cloud storage\n• Identity verification\n• Notifications\n• Analytics\n• Authentication\n\nThird-party services may have separate terms and privacy policies.' },
  { id: 51, title: '51. INTELLECTUAL PROPERTY', body: 'The HomeServe App and its software, design, branding, logos, graphics, text, interfaces, and databases are owned by or licensed to HomeServe.\n\nYou receive a limited right to use the App for legitimate participation on the platform.\n\nYou must not copy, reproduce, reverse engineer where prohibited by law, scrape, or misuse HomeServe intellectual property.' },
  { id: 52, title: '52. WORKER-SUBMITTED CONTENT', body: 'You may submit:\n• Photos\n• Documents\n• Messages\n• Service information\n• Other content\n\nYou must have the right to submit such content.\n\nYou authorize HomeServe to use submitted content as reasonably necessary to:\n• Operate the platform.\n• Provide services.\n• Display service evidence.\n• Resolve disputes.\n• Investigate complaints.\n• Maintain records.\n• Comply with legal obligations.' },
  { id: 53, title: '53. PROHIBITED CONTENT', body: 'Workers must not upload or send content that:\n• Violates applicable law.\n• Infringes another person\'s rights.\n• Contains malware.\n• Is fraudulent.\n• Is threatening.\n• Violates privacy.\n• Contains unnecessary sensitive information.\n• Impersonates another person.' },
  { id: 54, title: '54. TAXES', body: 'Workers are responsible for applicable tax obligations arising from their earnings.\n\nHomeServe may collect required tax information and make deductions or withholdings where required by law.' },
  { id: 55, title: '55. NO GUARANTEED EARNINGS', body: 'HomeServe does not guarantee:\n• Minimum earnings\n• Minimum bookings\n• Minimum customers\n• Fixed working hours\n• Fixed daily income\n\nEarnings may vary depending on demand, location, service category, availability, customer requirements, and other factors.' },
  { id: 56, title: '56. POLICY CHANGES', body: 'HomeServe may update:\n• Service categories\n• Commission rules\n• Payment rules\n• Withdrawal rules\n• Cancellation rules\n• Extra-time rules\n• Safety rules\n• Platform features\n• Worker policies\n\nMaterial changes will be communicated where required.' },
  { id: 57, title: '57. LIABILITY', body: 'To the maximum extent permitted by applicable law, HomeServe is not responsible for losses caused by circumstances outside its reasonable control.\n\nNothing in these Terms excludes liability that cannot legally be excluded.' },
  { id: 58, title: '58. WORKER RESPONSIBILITIES', body: 'You remain responsible for:\n• Professional conduct\n• Service quality\n• Applicable licenses\n• Compliance with law\n• Accurate information\n• Safe work practices\n• Applicable taxes and regulatory obligations' },
  { id: 59, title: '59. INDEMNIFICATION', body: 'To the extent permitted by law, you agree to indemnify HomeServe against claims, losses, liabilities, costs, or expenses arising from:\n• Your unlawful conduct\n• Fraud\n• Intentional misconduct\n• Violation of these Terms\n• Infringement of third-party rights\n• Misuse of customer information\n• Unauthorized off-platform transactions\n• Damage caused by your intentional or negligent conduct\n\nThis does not apply to liability that cannot legally be excluded.' },
  { id: 60, title: '60. FORCE MAJEURE', body: 'HomeServe will not be responsible for delays or failures caused by circumstances beyond reasonable control, including:\n• Natural disasters\n• Severe weather\n• Government restrictions\n• Civil disturbances\n• Telecommunications failures\n• Infrastructure failures\n• Widespread cyber incidents\n• Epidemics or pandemics\n• Third-party service outages' },
  { id: 61, title: '61. GRIEVANCE REDRESSAL', body: 'For complaints or grievances, contact:\n\nCompany: HomeServe Technologies Private Limited\nEmail: support@homeserve.in\nGrievance Officer: Legal & Compliance Team\nGrievance Email: grievance@homeserve.in\nAddress: Registered Office Address' },
  { id: 62, title: '62. DISPUTE RESOLUTION', body: 'Workers should first attempt to resolve disputes through HomeServe support and grievance mechanisms.\n\nIf a dispute cannot be resolved internally, the parties may use remedies available under applicable law.\n\nAny arbitration provision, if applicable, will be governed by a separate legally reviewed clause.' },
  { id: 63, title: '63. GOVERNING LAW', body: 'These Terms are governed by the laws of India, subject to applicable mandatory legal rights and protections.\n\nJurisdiction: Courts of competent jurisdiction in India.' },
  { id: 64, title: '64. SEVERABILITY', body: 'If any provision of these Terms is found invalid or unenforceable, the remaining provisions will continue to apply to the extent permitted by law.' },
  { id: 65, title: '65. ACCOUNT TRANSFER', body: 'You may not sell, transfer, rent, or assign your HomeServe Worker account to another person.\n\nYour account is personal to you.' },
  { id: 66, title: '66. PLATFORM INTEGRITY', body: 'You must not attempt to manipulate:\n• Booking allocation\n• GPS\n• Payments\n• Wallets\n• Coupons\n• Ratings\n• Job status\n• Timestamps\n• Notifications\n• Platform APIs\n• Other technical systems\n\nSecurity vulnerabilities should be reported responsibly to HomeServe.' },
  { id: 67, title: '67. ACCOUNT DELETION', body: 'You may request account deletion through the available HomeServe process.\n\nCertain information may be retained where required for:\n• Legal compliance\n• Tax records\n• Financial records\n• Dispute resolution\n• Fraud prevention\n• Security\n• Other lawful purposes' },
  { id: 68, title: '68. SURVIVAL', body: 'Provisions concerning payments, outstanding balances, confidentiality, intellectual property, privacy, liability, indemnification, dispute resolution, and legal obligations may continue after account termination where necessary.' },
  { id: 69, title: '69. CONTACT', body: 'HomeServe Worker Support\nCompany: HomeServe Technologies Private Limited\nWorker Support Email: partner-support@homeserve.in\nLegal Email: legal@homeserve.in\nGrievance Officer: Compliance Department\nGrievance Email: grievance@homeserve.in' },
  { id: 70, title: '70. WORKER ACKNOWLEDGEMENT', body: 'By continuing to use the HomeServe Worker App, you confirm that:\n• You have read and understood these Terms.\n• The information provided by you is accurate.\n• The documents provided by you are genuine and belong to you.\n• You will provide services honestly and professionally.\n• You will follow HomeServe safety and payment procedures.\n• You will not misuse customer information.\n• You will not manipulate platform systems.\n• You agree to comply with applicable laws and HomeServe policies.' },
];

export default function Login() {
  const router = useRouter();
  const { sendOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const [agreed, setAgreed] = useState(true);
  const [termsModalVisible, setTermsModalVisible] = useState(false);

  const handleContinue = async () => {
    if (!agreed) {
      setError('Please agree to the HomeServe Worker Terms & Conditions to proceed.');
      return;
    }
    const cleaned = phone.replace(/\s/g, '');
    if (cleaned.length < 10) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    const fullPhone = cleaned.startsWith('+') ? cleaned : `+91${cleaned}`;
    setError('');
    setLoading(true);
    try {
      const devOtp = await sendOtp(fullPhone);
      router.push({ pathname: '/(auth)/otp', params: { phone: fullPhone, devOtp: devOtp || '' } });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.content}>
          {/* BRAND HEADER */}
          <View style={styles.brandRow}>
            <View style={styles.logoCard}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.brandTitleGroup}>
                <Text style={styles.brandName}>HomeServe</Text>
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              </View>
              <Text style={styles.brandSub}>Partner Workspace</Text>
            </View>
          </View>

          {/* MAIN HEADING */}
          <Text style={styles.heading}>Welcome, Partner</Text>
          <Text style={styles.subheading}>
            Sign in with your registered phone number to manage jobs and track earnings.
          </Text>

          {/* PHONE INPUT FORM */}
          <View style={styles.formWrap}>
            <Text style={styles.inputLabel}>Mobile Number</Text>
            <View style={[styles.phoneInputWrap, focused && styles.phoneInputWrapFocused, error ? styles.phoneInputWrapError : null]}>
              <View style={styles.countryCodeBadge}>
                <Text style={styles.flagIcon}>🇮🇳</Text>
                <Text style={styles.countryCodeText}>+91</Text>
              </View>
              <View style={styles.inputDivider} />
              <TextInput
                style={styles.phoneInput}
                placeholder="98765 43210"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(t) => {
                  setPhone(t.replace(/[^0-9]/g, ''));
                  if (error) setError('');
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                maxLength={10}
              />
              {phone.length === 10 ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.success} style={{ marginRight: spacing.sm }} />
              ) : null}
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* CHECKBOX AGREEMENT */}
            <Pressable
              onPress={() => setAgreed(!agreed)}
              style={styles.checkboxRow}
            >
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed && <Ionicons name="checkmark" size={14} color={colors.white} />}
              </View>
              <Text style={styles.checkboxText}>
                I agree to the{' '}
                <Text onPress={() => setTermsModalVisible(true)} style={styles.termsLink}>
                  HomeServe Worker Terms & Conditions and Privacy Policy
                </Text>
              </Text>
            </Pressable>

            <Button
              title="Continue"
              onPress={handleContinue}
              loading={loading}
              style={{ marginTop: spacing.xl }}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* FULL SCROLLABLE TERMS & CONDITIONS MODAL */}
      <Modal
        visible={termsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTermsModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          {/* MODAL HEADER */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>HOMESERVE WORKER TERMS & CONDITIONS</Text>
              <Text style={styles.modalSub}>Effective Date: August 2026 · 70 Full Policy Sections</Text>
            </View>
            <Pressable onPress={() => setTermsModalVisible(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* SCROLLABLE TERMS CONTENT */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.termsNoticeBox}>
              <Ionicons name="information-circle" size={20} color={colors.primary} />
              <Text style={styles.termsNoticeText}>
                Welcome to the HomeServe Worker App. Please review our platform operating guidelines, safety requirements, and worker terms below.
              </Text>
            </View>

            {TERMS_SECTIONS.map((section) => (
              <View key={section.id} style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
              </View>
            ))}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* MODAL FOOTER ACTION BAR */}
          <View style={styles.modalFooter}>
            <Pressable
              onPress={() => setAgreed(!agreed)}
              style={styles.modalCheckboxRow}
            >
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed && <Ionicons name="checkmark" size={14} color={colors.white} />}
              </View>
              <Text style={styles.modalCheckboxText}>
                I agree to the HomeServe Worker Terms & Conditions and Privacy Policy
              </Text>
            </Pressable>

            <Button
              title="Accept & Continue"
              onPress={() => {
                setAgreed(true);
                setTermsModalVisible(false);
              }}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xxl, gap: spacing.md },
  logoCard: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.subtle,
  },
  logoImg: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  brandTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  brandName: { fontSize: fontSize.xxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  proBadge: { backgroundColor: colors.primary, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.xs },
  proBadgeText: { color: colors.white, fontSize: 11, fontWeight: fontWeight.extrabold, letterSpacing: 0.5 },
  brandSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, fontWeight: fontWeight.medium },
  heading: { fontSize: fontSize.xxxl, fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing.xs },
  subheading: { fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22, marginBottom: spacing.xxl },
  formWrap: { marginTop: spacing.sm },
  inputLabel: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing.sm },
  phoneInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 56,
    ...shadow.subtle,
  },
  phoneInputWrapFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  phoneInputWrapError: { borderColor: colors.danger },
  countryCodeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flagIcon: { fontSize: 18 },
  countryCodeText: { fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.textPrimary },
  inputDivider: { width: 1, height: 26, backgroundColor: colors.border, marginHorizontal: spacing.md },
  phoneInput: { flex: 1, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary },
  errorText: { color: colors.danger, fontSize: fontSize.xs, marginTop: spacing.xs },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.lg },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxText: { flex: 1, fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 19 },
  termsLink: { color: colors.primary, fontWeight: fontWeight.bold, textDecorationLine: 'underline' },

  /* MODAL STYLES */
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  modalTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  modalSub: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  modalScrollContent: { padding: spacing.lg, gap: spacing.md },
  termsNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
  },
  termsNoticeText: { flex: 1, fontSize: fontSize.xs, color: colors.primaryDark, lineHeight: 18 },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadow.subtle,
  },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: spacing.xs },
  sectionBody: { fontSize: fontSize.xs, color: colors.textPrimary, lineHeight: 19 },
  modalFooter: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.surface,
  },
  modalCheckboxRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  modalCheckboxText: { flex: 1, fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textPrimary },
});