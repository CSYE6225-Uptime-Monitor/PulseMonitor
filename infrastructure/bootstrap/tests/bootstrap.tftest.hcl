# TDD: verifies the remote-state backing store is defined securely, and that
# the GitHub Actions deploy role can only be assumed by this repo's main
# branch.
#
# Runs offline. The mocked "aws" provider is what lets the trust-policy
# assertions below use command = apply without touching real AWS: that policy
# embeds aws_iam_openid_connect_provider.github[0].arn, a computed attribute
# that stays unknown through plan.
mock_provider "aws" {
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }
}

run "state_store_is_secure" {
  command = plan

  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "State bucket must have versioning enabled to recover prior state."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.state.block_public_acls && aws_s3_bucket_public_access_block.state.block_public_policy && aws_s3_bucket_public_access_block.state.ignore_public_acls && aws_s3_bucket_public_access_block.state.restrict_public_buckets
    error_message = "State bucket must block all public access."
  }

  assert {
    condition     = aws_dynamodb_table.locks.hash_key == "LockID"
    error_message = "Lock table must use LockID as its hash key for the S3 backend."
  }
}

run "github_deploy_role_is_scoped_to_this_repo_and_branch" {
  # apply (not plan): the trust policy embeds the OIDC provider's computed
  # ARN, which is unknown until apply even under mock_provider.
  command = apply

  # contains()/length() rather than == on a collection: client_id_list is a
  # set(string) and the decoded sub condition is a tuple, so a direct
  # comparison against a list literal fails on type rather than on value.
  assert {
    condition = (
      length(one(aws_iam_openid_connect_provider.github).client_id_list) == 1 &&
      contains(one(aws_iam_openid_connect_provider.github).client_id_list, "sts.amazonaws.com")
    )
    error_message = "The OIDC provider must pin the audience to exactly sts.amazonaws.com, or a token minted for another cloud could be replayed against AWS."
  }

  assert {
    condition     = jsondecode(one(aws_iam_role.github_deploy).assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "The trust policy must require the sts.amazonaws.com audience."
  }

  assert {
    condition = (
      length(jsondecode(one(aws_iam_role.github_deploy).assume_role_policy).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"]) == 1 &&
      contains(
        jsondecode(one(aws_iam_role.github_deploy).assume_role_policy).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"],
        "repo:CSYE6225-Uptime-Monitor/PulseMonitor:ref:refs/heads/main"
      )
    )
    error_message = "By default only this repo's main branch may assume the deploy role - a bare repo:owner/repo:* would let any branch or fork PR deploy to production."
  }

  assert {
    condition     = jsondecode(one(aws_iam_role.github_deploy).assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity"
    error_message = "The deploy role must be assumable only via web identity federation."
  }
}

run "github_oidc_can_be_disabled" {
  command = plan

  variables {
    enable_github_oidc = false
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0 && length(aws_iam_role.github_deploy) == 0
    error_message = "enable_github_oidc = false must provision no OIDC provider and no deploy role."
  }
}

run "rejects_a_malformed_repository" {
  command = plan

  variables {
    github_repository = "not-an-owner-slash-repo/extra/segments"
  }

  expect_failures = [var.github_repository]
}
